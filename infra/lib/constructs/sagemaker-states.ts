import * as path from 'path'
import * as cdk from '@aws-cdk/core'
import * as iam from '@aws-cdk/aws-iam'
import * as lambda from '@aws-cdk/aws-lambda'
import * as lambdaPython from '@aws-cdk/aws-lambda-python'
import * as sfn from '@aws-cdk/aws-stepfunctions'
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks'

interface IStateFunctions {
  datasetFunction: lambda.IFunction
  trainFunction: lambda.IFunction
  deployFunction: lambda.IFunction
}

export class SagemakerStates extends cdk.Construct {
  public readonly stateMachine: sfn.StateMachine

  constructor(scope: cdk.Construct, id: string) {
    super(scope, id)

    const stateFunctions = this.createSfnFunctions()
    this.stateMachine = this.createStateMachine(stateFunctions)
  }

  private createSfnFunctions(): IStateFunctions {
    const sagemakerExecutionRole = new iam.Role(this, 'SagemakerExecutionRole', {
      assumedBy: new iam.ServicePrincipal('sagemaker.amazonaws.com'),
      managedPolicies: [
        { managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonSageMakerAdmin-ServiceCatalogProductsServiceRolePolicy' },
        { managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonS3FullAccess' },
      ],
    })
    const lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        { managedPolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole' },
        { managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonSagemakerFullAccess' },
        { managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonS3FullAccess' },
      ],
    })

    const datasetFunction = new lambdaPython.PythonFunction(this, 'DatasetFunction', {
      entry: path.join(__dirname, '..', 'functions', 'sfn', 'dataset'),
      handler: 'handler',
      runtime: lambda.Runtime.PYTHON_3_8,
      role: lambdaExecutionRole,
      memorySize: 2048,
      timeout: cdk.Duration.minutes(5),
    })
    const trainFunction = new lambdaPython.PythonFunction(this, 'TrainFunction', {
      entry: path.join(__dirname, '..', 'functions', 'sfn', 'train'),
      handler: 'handler',
      runtime: lambda.Runtime.PYTHON_3_8,
      timeout: cdk.Duration.minutes(5),
      role: lambdaExecutionRole,
      environment: {
        ROLE_ARN: sagemakerExecutionRole.roleArn,
      },
    })
    const deployFunction = new lambdaPython.PythonFunction(this, 'DeployFunction', {
      entry: path.join(__dirname, '..', 'functions', 'sfn', 'deploy'),
      handler: 'handler',
      runtime: lambda.Runtime.PYTHON_3_8,
      timeout: cdk.Duration.minutes(5),
      role: lambdaExecutionRole,
    })

    return {
      datasetFunction,
      trainFunction,
      deployFunction,
    }
  }

  private createStateMachine(stateFunctions: IStateFunctions): sfn.StateMachine {
    const datasetTask = new tasks.LambdaInvoke(this, 'DatasetTask', {
      lambdaFunction: stateFunctions.datasetFunction,
      outputPath: '$.Payload',
    })
    const trainTask = new tasks.LambdaInvoke(this, 'TrainTask', {
      lambdaFunction: stateFunctions.trainFunction,
      outputPath: '$.Payload',
    })
    trainTask.addRetry({
      interval: cdk.Duration.seconds(30),
      maxAttempts: 1000,
      backoffRate: 1.1,
    })
    const deployTask = new tasks.LambdaInvoke(this, 'DeployTask', {
      lambdaFunction: stateFunctions.deployFunction,
      outputPath: '$.Payload',
    })
    deployTask.addRetry({
      interval: cdk.Duration.seconds(30),
      maxAttempts: 1000,
      backoffRate: 1.1,
    })

    const definition = sfn.Chain
      .start(datasetTask)
      .next(trainTask)
      .next(deployTask)
      .next(new sfn.Succeed(this, `Success`))
    const role = new iam.Role(this, 'StateMachineRole', {
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
      managedPolicies: [
        { managedPolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole' },
        { managedPolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaRole' },
        { managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonSagemakerFullAccess' },
      ],
    });
    return new sfn.StateMachine(this, 'StateMachine', {
      stateMachineName: 'StateMachine',
      definition,
      role,
    })
  }

}