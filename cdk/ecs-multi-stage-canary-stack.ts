#!/usr/bin/env node
// cdk imports
import * as cdk from 'aws-cdk-lib';

// stack imports
import { NetworkingStack } from './networking-stack';
import { EcsStack } from './ecs-stack';
import { EcsCanaryDeploymentStack } from './ecs-canary-deployment-stack';

export class EcsMultiStageCanaryStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const networkingStack = new NetworkingStack(this, 'NetworkingStack');
    const ecsStack = new EcsStack(this, 'EcsStack', { networking: networkingStack });
    const ecsCanaryDeploymentStack = new EcsCanaryDeploymentStack(this, 'EcsCanaryDeploymentStack', { networking: networkingStack, ecs: ecsStack });

  }
}
