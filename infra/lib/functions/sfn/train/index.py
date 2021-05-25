import os
import json
import boto3
import sagemaker
from sagemaker.inputs import TrainingInput

client = None

REGION = os.environ['REGION']
EXECUTION_ROLE = os.environ['ROLE_ARN']

DEFAULT_HP = {
    'eta': '0.1',
    'objective': 'binary:logistic',
    'num_round': '20'
}


class InProgressError(Exception):
    pass


def handler(event, context):
    event['stage'] = 'train'

    hyperparameters = event.get('hyperparameters', None)
    hyperparameters = hyperparameters if hyperparameters else DEFAULT_HP

    bucket = event['bucket']
    prefix = event['prefix']
    job_name = event['job_name']
    status = None

    try:
        global client
        if not client:
            client = boto3.client('sagemaker')

        response = client.describe_training_job(
            TrainingJobName=job_name
        )
        status = response['TrainingJobStatus']
    except:
        xgboost_container = sagemaker.image_uris.retrieve('xgboost', REGION, '1.2-1')
        checkpoint_path = f's3://{bucket}/{prefix}/checkpoints'
        output_path='s3://{}/{}/output'.format(bucket, prefix)
        estimator = sagemaker.estimator.Estimator(
            image_uri=xgboost_container, 
            hyperparameters=hyperparameters,
            role=EXECUTION_ROLE,
            instance_count=1, 
            instance_type='ml.m5.2xlarge', 
            volume_size=5,
            output_path=output_path,
            use_spot_instances=True,
            checkpoint_s3_uri=checkpoint_path,
            max_run=60*60,
            max_wait=60*60,
            enable_sagemaker_metrics=True,

        )

        s3_input_train = TrainingInput(
            s3_data=f's3://{bucket}/{prefix}/train',
            content_type='text/csv',
        )
        s3_input_validation = TrainingInput(
            s3_data=f's3://{bucket}/{prefix}/validation/',
            content_type='text/csv',
        )
 
        estimator.fit(
            {
                'train': s3_input_train,
                'validation': s3_input_validation
            },
            wait=False,
            job_name=job_name,
        )

    if status == 'Completed':
        return event
    elif (status is None) or (status == 'InProgress'):
        raise InProgressError('the training job is not completed yet')
    else:
        raise RuntimeError(f'Error with status: {status}')