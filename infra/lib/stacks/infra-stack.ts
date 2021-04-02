import * as cdk from '@aws-cdk/core';
import { SagemakerStates } from '../constructs/sagemaker-states'

export class InfraStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    new SagemakerStates(this, `SagemakerStates`)
  }
}
