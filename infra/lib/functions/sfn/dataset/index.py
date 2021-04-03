import os
import boto3
import numpy as np
import pandas as pd
from datetime import datetime

s3 = boto3.client('s3')


def handler(event, context):
    event['stage'] = 'dataset'

    bucket = event.get('bucket', 'dongkyl-sagemaker')
    prefix = event.get('prefix', 'sagemaker/xgboost_credit_risk')
    event['bucket'] = bucket
    event['prefix'] = prefix

    job_prefix = event.get('job_prefix', 'dongkyl')
    job_uniq_id = int(datetime.now().timestamp())
    job_name = f'{job_prefix}-{job_uniq_id}'
    endpoint_name = f'{job_prefix}-{job_uniq_id}'
    event['job_name'] = job_name
    event['endpoint_name'] = endpoint_name

    key = event.get('key', 'card.xls')

    data = s3.get_object(Bucket=bucket, Key=key)
    dataset = pd.read_excel(data['Body'].read())
    dataset = dataset.drop('Unnamed: 0', axis=1)
    dataset = pd.concat([dataset['Y'], dataset.drop(['Y'], axis=1)], axis=1)

    train_data, validation_data, test_data = np.split(
        dataset.sample(frac=1, random_state=1729),
        [int(0.7 * len(dataset)), int(0.9 * len(dataset))]
    )
    train_data.to_csv('/tmp/train.csv', header=False, index=False)
    validation_data.to_csv('/tmp/validation.csv', header=False, index=False)

    bucket_resource = boto3.Session().resource('s3').Bucket(bucket)
    bucket_resource.Object(
        os.path.join(prefix, 'train/train.csv')
    ).upload_file('/tmp/train.csv')
    bucket_resource.Object(
        os.path.join(prefix, 'validation/validation.csv')
    ).upload_file('/tmp/validation.csv')

    return event