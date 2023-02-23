#!/usr/bin/env node
// service imports
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as logs from 'aws-cdk-lib/aws-logs';

// cdk imports
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

// stack imports
import { NetworkingStack } from './networking-stack';

interface EcsStackProps extends cdk.NestedStackProps {
  readonly networking: NetworkingStack;
}

// iam for ecs
export class EcsRoles extends Construct {
  public ecsRole: iam.Role;
  constructor(scope: Construct, id: string,) {
    super(scope, id);

    this.ecsRole = new iam.Role(this, 'EcsTaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'ECS Multi Stage Canary ECS Task Execution Role',
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')],
      roleName: 'ecsTaskExecutionRole',
    });
  }
}

export class EcsStack extends cdk.NestedStack {
  public latestEcsService: ecs.FargateService;
  public stableEcsService: ecs.FargateService;
  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);

    const ecsRoles = new EcsRoles(this, 'EcsRoles');

    const mainCluster = new ecs.Cluster(this, 'Cluster', { clusterName: 'MainCluster', vpc: props.networking.vpc });

    const logGroup = new logs.LogGroup(this, 'EcsLogGroup', { logGroupName: '/ecs/multi-stage-canary', removalPolicy: cdk.RemovalPolicy.DESTROY, });

    // latest service
    this.latestEcsService = this.createEcsService(mainCluster, 'amazon/amazon-ecs-sample', 'latest', 2);
    this.latestEcsService.attachToApplicationTargetGroup(props.networking.latestTargetGroupA);
    this.latestEcsService.connections.allowFrom(props.networking.alb, ec2.Port.tcp(80));

    // stable service
    this.stableEcsService = this.createEcsService(mainCluster, 'amazon/amazon-ecs-sample', 'stable', 0);
    this.stableEcsService.attachToApplicationTargetGroup(props.networking.stableTargetGroupA);
    this.stableEcsService.connections.allowFrom(props.networking.alb, ec2.Port.tcp(80));

    // ssm
    const stableServiceName = new ssm.StringParameter(this, 'StableServiceName', {
      parameterName: 'stableServiceName',
      stringValue: this.stableEcsService.serviceName,
    });
    const mainClusterArn = new ssm.StringParameter(this, 'MainClusterArn', {
      parameterName: 'mainClusterArn',
      stringValue: mainCluster.clusterArn,
    });
    // cdk constructs
  }
  private createEcsService(
    cluster: ecs.Cluster,
    containerImage: string,
    id: string,
    desiredCount: number) {
    const taskDefinitionLatest = new ecs.TaskDefinition(this, `task-${id}`, {
      family: id,
      compatibility: ecs.Compatibility.EC2_AND_FARGATE,
      cpu: '256',
      memoryMiB: '512',
      networkMode: ecs.NetworkMode.AWS_VPC,
    });
    const containerLatest = taskDefinitionLatest.addContainer(`${id}-container`, {
      image: ecs.ContainerImage.fromRegistry(containerImage),
      memoryLimitMiB: 512,
      logging: ecs.LogDriver.awsLogs({ streamPrefix: `${id}-logs` }),
    });
    containerLatest.addPortMappings({
      containerPort: 80,
      protocol: ecs.Protocol.TCP,
    });
    return new ecs.FargateService(this, `ecs-service-${id}`, {
      cluster,
      taskDefinition: taskDefinitionLatest,
      desiredCount: desiredCount,
      serviceName: id,
      deploymentController: {
        type: ecs.DeploymentControllerType.CODE_DEPLOY,
      },
    });
  }
}
