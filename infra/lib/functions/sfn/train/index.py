import os
import boto3
import sagemaker
from sagemaker.inputs import TrainingInput

client = boto3.client('sagemaker')
EXECUTION_ROLE = os.environ['ROLE_ARN']

bucket = 'dongkyl-sagemaker'
prefix = 'sagemaker/xgboost_credit_risk'
region = 'ap-northeast-2'


class ResourceNotFound(Exception):
    pass


def handler(event, context):
    event['stage'] = 'train'

    job_name = event['job_name']
    status = None

    try:
        response = client.describe_training_job(
            TrainingJobName=job_name
        )
        print(response)
        status = response['TrainingJobStatus']
    except:
        xgboost_container = sagemaker.image_uris.retrieve("xgboost", region, "1.2-1")
        s3_input_train = TrainingInput(s3_data='s3://{}/{}/train'.format(bucket, prefix), content_type='csv')
        s3_input_validation = TrainingInput(s3_data='s3://{}/{}/validation/'.format(bucket, prefix), content_type='csv')
        hyperparameters = {
            "eta":"0.1",
            "objective":"binary:logistic",
            "num_round":"25"
        }

        output_path='s3://{}/{}/output'.format(bucket, prefix)

        estimator = sagemaker.estimator.Estimator(
            image_uri=xgboost_container, 
            hyperparameters=hyperparameters,
            role=EXECUTION_ROLE,
            instance_count=1, 
            instance_type='ml.m5.2xlarge', 
            volume_size=5,
            output_path=output_path
        )

        estimator.fit(
            {
                'train': s3_input_train,
                'validation': s3_input_validation
            },
            wait=False,
            job_name=job_name,
        )

    if status != 'Completed':
        raise ResourceNotFound('the training job is not completed')

    return event