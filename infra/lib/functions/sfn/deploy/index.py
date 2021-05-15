import boto3
import sagemaker

client = None


class InProgressError(Exception):
    pass


def handler(event, context):
    event['stage'] = 'deploy'

    job_name = event['job_name']
    endpoint_name = event['endpoint_name']
    status = None

    try:
        global client
        if not client:
            client = boto3.client('sagemaker')

        response = client.describe_endpoint(
            EndpointName=endpoint_name
        )
        print(response)
        status = response['EndpointStatus']
    except:
        estimator = sagemaker.estimator.Estimator.attach(job_name)
        estimator.deploy(
            initial_instance_count=1,
            instance_type='ml.m5.2xlarge',
            wait=False,
            endpoint_name=endpoint_name,
        )

    if status == 'InService':
        return event
    elif (status is None) or (status in ['Creating', 'Updating']):
        raise InProgressError('the endpoint is not in-service yet')
    else:
        raise RuntimeError(f'Error with status {status}')