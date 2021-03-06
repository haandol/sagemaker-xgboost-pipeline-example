import os
import json
import requests

webhook_uri = os.environ['WEBHOOK']


def handler(event, context):
    print(json.dumps(event))

    for record in event['Records']:
        message = record['Sns']['Message']
        requests.post(url=webhook_uri, json={ 'Content': message }, timeout=3)
    return 'ok'