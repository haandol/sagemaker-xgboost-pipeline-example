# Amazon Sagemaker Xgboost Pipeline

This repository is about provisioning MLOps pipeline for Amazon Sagemaker built-in Xgboost model

<img src="img/architecture.png" />

# Prerequisites

- awscli
- Nodejs 12.x+
- Python 3.7+
- Docker
- AWS Account and Locally configured AWS credential

# Installation


Install project dependencies

```bash
$ cd infra
$ npm i
```

Install cdk in global context and run `cdk bootstrap` if you did not initailize cdk yet.

```bash
$ npm i -g cdk@1.100.0
$ cdk bootstrap
```

Open [**config.ts**](infra/lib/interfaces/config.ts) and edit *App.Webhook* variable which URI will be `POSTed` by StepFunction's Termnial Task(Succeed / Fail)

Deploy CDK Stacks on AWS

```bash
$ cdk deploy "*" --require-approval never
```

# Usage

## Upload dataset to S3

Deployment will display bucket arn on the terminal,

*SagemakerXgboostDemoInfraStack.SagemakerBucketOutput = sagemakerxgboostdemoinfra-sagemakerbucketXXXXXXXX-YYYYYYYYYYYY*

Set it as environment to use below

```bash
$ export BUCKET_NAME=sagemakerxgboostdemoinfra-sagemakerbucketXXXXXXXX-YYYYYYYYYYYY
```

Upload original dataset to the bucket. the dataset is [**credit card clients dataset from UCI**](https://archive.ics.uci.edu/ml/datasets/default+of+credit+card+clients)
with the data, we are going to classify the given user whether overdue the load or not, next month.

```bash
$ aws s3 cp ../data/card.xls s3://$BUCKET_NAME/card.xls
```

## Execute statemachine

Deployment will display state-machine-arn on the terminal,

*SagemakerXgboostDemoInfraStack.SagemakerStatesStatemachineArnXXXXXXXX = arn:aws:states:ap-northeast-2:XXXXXXXXXXXX:stateMachine:StateMachine*

Set it as environment to use below

```bash
$ export STATE_MACHINE=arn:aws:states:ap-northeast-2:XXXXXXXXXXXX:stateMachine:StateMachine
```

Run statemachine with AWSCLI

```bash
$ aws stepfunctions start-execution --state-machine-arn $STATE_MACHINE
{
    "executionArn": "arn:aws:states:ap-northeast-2:929831892372:execution:StateMachine:b1b23dd1-b2e6-40dd-b1b8-b07183505d9e",
    "startDate": 1617504354.973
}
```

Visit [**AWS StepFunctions Console**](https://ap-northeast-2.console.aws.amazon.com/states/home?region=ap-northeast-2#/statemachines) to see progress of the statemachine

<img src="img/statemachine.png">

## Test

Ref [**notebook**](notebook/Xgboost.ipynb)

# Cleanup

```bash
$ cdk destroy "*"
```
