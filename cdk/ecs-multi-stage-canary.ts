#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EcsMultiStageCanaryStack } from './ecs-multi-stage-canary-stack';

const app = new cdk.App();
new EcsMultiStageCanaryStack(app, 'EcsMultiStageCanaryStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

app.synth();