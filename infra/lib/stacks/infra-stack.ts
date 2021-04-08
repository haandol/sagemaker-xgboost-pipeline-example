import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import { SagemakerStates } from '../constructs/sagemaker-states'

export class InfraStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const bucket = this.createBucket()
    new SagemakerStates(this, `SagemakerStates`, {
      bucket,
    })
  }

  private createBucket(): s3.IBucket {
    const bucket = new s3.Bucket(this, `SagemakerBucket`, {
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })
    new cdk.CfnOutput(this, `SagemakerBucketOutput`, {
      value: bucket.bucketName,
    })
    return bucket
  }
}
