import * as path from 'path'
import * as cdk from '@aws-cdk/core'
import * as iam from '@aws-cdk/aws-iam'
import * as s3 from '@aws-cdk/aws-s3'
import * as sns from '@aws-cdk/aws-sns'
import * as snsSubscriptions from '@aws-cdk/aws-sns-subscriptions'
import * as lambda from '@aws-cdk/aws-lambda'
import * as lambdaPython from '@aws-cdk/aws-lambda-python'
import * as sfn from '@aws-cdk/aws-stepfunctions'
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks'

interface IProps {
  bucket: s3.IBucket
}

interface IStateFunctions {
  datasetFunction: lambda.IFunction
  trainFunction: lambda.IFunction
  deployFunction: lambda.IFunction
  notifyFunction: lambda.IFunction
}

export class SagemakerStates extends cdk.Construct {
  public readonly stateMachine: sfn.StateMachine

  constructor(scope: cdk.Construct, id: string, props: IProps) {
    super(scope, id)

    const stateFunctions = this.createSfnFunctions(props.bucket)

    const topic = new sns.Topic(this, `Topic`)
    this.stateMachine = this.createStateMachine(topic, stateFunctions)
    topic.grantPublish(this.stateMachine)

    new cdk.CfnOutput(this, `StatemachineArn`, {
      value: this.stateMachine.stateMachineArn
    })
  }

  private createSfnFunctions(bucket: s3.IBucket): IStateFunctions {
    const sagemakerExecutionRole = new iam.Role(this, 'SagemakerExecutionRole', {
      assumedBy: new iam.ServicePrincipal('sagemaker.amazonaws.com'),
      managedPolicies: [
        { managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonSageMakerAdmin-ServiceCatalogProductsServiceRolePolicy' },
      ],
    })
    bucket.grantReadWrite(sagemakerExecutionRole)

    const lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        { managedPolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole' },
        { managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonSagemakerFullAccess' },
      ],
    })
    bucket.grantReadWrite(lambdaExecutionRole)

    const datasetFunction = new lambdaPython.PythonFunction(this, 'DatasetFunction', {
      entry: path.join(__dirname, '..', 'functions', 'sfn', 'dataset'),
      handler: 'handler',
      runtime: lambda.Runtime.PYTHON_3_8,
      role: lambdaExecutionRole,
      memorySize: 2048,
      timeout: cdk.Duration.minutes(5),
      environment: {
        BUCKET: bucket.bucketName,
      },
    })
    const trainFunction = new lambdaPython.PythonFunction(this, 'TrainFunction', {
      entry: path.join(__dirname, '..', 'functions', 'sfn', 'train'),
      handler: 'handler',
      runtime: lambda.Runtime.PYTHON_3_8,
      timeout: cdk.Duration.seconds(30),
      role: lambdaExecutionRole,
      environment: {
        ROLE_ARN: sagemakerExecutionRole.roleArn,
        REGION: cdk.Stack.of(this).region,
      },
    })
    const deployFunction = new lambdaPython.PythonFunction(this, 'DeployFunction', {
      entry: path.join(__dirname, '..', 'functions', 'sfn', 'deploy'),
      handler: 'handler',
      runtime: lambda.Runtime.PYTHON_3_8,
      timeout: cdk.Duration.seconds(30),
      role: lambdaExecutionRole,
    })
    const notifyFunction = new lambdaPython.PythonFunction(this, 'NotifyFunction', {
      entry: path.join(__dirname, '..', 'functions', 'sfn', 'notify'),
      handler: 'handler',
      runtime: lambda.Runtime.PYTHON_3_8,
      timeout: cdk.Duration.seconds(30),
      role: lambdaExecutionRole,
      environment: {
        CHIME_WEBHOOK: 'https://hooks.chime.aws/incomingwebhooks/f751e2d5-cfe3-48d8-a1a5-a61dad7d4133?token=R1IzWnd6Qkx8MXxXdTQyRHNPdG5mSUUxNWJQS3duRmFKRnhNLW5pSjdvUXAzSE9DMWdZOGtJ'
      },
    })

    return {
      datasetFunction,
      trainFunction,
      deployFunction,
      notifyFunction,
    }
  }

  private createStateMachine(topic: sns.ITopic, stateFunctions: IStateFunctions): sfn.StateMachine {
    topic.addSubscription(new snsSubscriptions.LambdaSubscription(stateFunctions.notifyFunction))

    const succeedTask = new tasks.SnsPublish(this, `Success`, {
      topic,
      message: sfn.TaskInput.fromJsonPathAt('$')
    })
    const failTask = new tasks.SnsPublish(this, `Fail`, {
      topic,
      message: sfn.TaskInput.fromJsonPathAt('$.Cause')
    })

    const datasetTask = new tasks.LambdaInvoke(this, 'DatasetTask', {
      lambdaFunction: stateFunctions.datasetFunction,
      timeout: cdk.Duration.minutes(5),
      outputPath: '$.Payload',
    })
    datasetTask.addCatch(failTask)

    const trainTask = new tasks.LambdaInvoke(this, 'TrainTask', {
      lambdaFunction: stateFunctions.trainFunction,
      timeout: cdk.Duration.seconds(30),
      outputPath: '$.Payload',
    })
    trainTask.addRetry({
      errors: ['InProgressError'],
      interval: cdk.Duration.seconds(15),
      maxAttempts: 5000,
      backoffRate: 1.1,
    })
    trainTask.addCatch(failTask)

    const deployTask = new tasks.LambdaInvoke(this, 'DeployTask', {
      lambdaFunction: stateFunctions.deployFunction,
      timeout: cdk.Duration.seconds(30),
      outputPath: '$.Payload',
    })
    deployTask.addRetry({
      errors: ['InProgressError'],
      interval: cdk.Duration.seconds(15),
      maxAttempts: 5000,
      backoffRate: 1.1,
    })
    deployTask.addCatch(failTask)

    const definition = sfn.Chain
      .start(datasetTask)
      .next(trainTask)
      .next(deployTask)
      .next(succeedTask)
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