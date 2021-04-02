#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from '@aws-cdk/core'
import { InfraStack } from '../lib/stacks/infra-stack'
import { App } from '../lib/interfaces/config'

const app = new cdk.App()
new InfraStack(app, `${App.Namespace}InfraStack`)