#!/usr/bin/env node
// service imports
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codedeploy from 'aws-cdk-lib/aws-codedeploy';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';

// external imports
import { ImageRepository } from '@cloudcomponents/cdk-container-registry';
import { EcsDeploymentConfig } from '@cloudcomponents/cdk-blue-green-container-deployment';
import * as taskDefinitionTemplateFile from '../assets/taskdef-tmpl.json';
import * as fs from 'fs';

// cdk imports
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

// stack imports
import { NetworkingStack } from './networking-stack';
import { EcsStack } from './ecs-stack';

interface EcsCanaryDeploymentStackProps extends cdk.NestedStackProps {
  readonly networking: NetworkingStack;
  readonly ecs: EcsStack;
}

// iam for cicd
export class DeploymentRoles extends Construct {
  public codeDeployRole: iam.Role;
  public lifecycleHookLambdaRole: iam.Role;
  constructor(scope: Construct, id: string,) {
    super(scope, id);

    // codeDeploy
    this.codeDeployRole = new iam.Role(this, 'CodeDeployRole', {
      assumedBy: new iam.ServicePrincipal('codedeploy.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCodeDeployRoleForECS')],
      roleName: 'codeDeployRole',
    });

    // codeDeploy lifecycle hook lambda role
    this.lifecycleHookLambdaRole = new iam.Role(this, 'LifecycleHookLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')],
      roleName: 'lifecycleHookLambdaRole',
    });

    this.lifecycleHookLambdaRole.attachInlinePolicy(
      new iam.Policy(this, 'ecs-multi-stage-canary-policy', {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              'ecs:DescribeServices',
              'ecs:UpdateService',
              'ecs:ListTasks',
              'elasticloadbalancing:SetRulePriorities',
              'codedeploy:PutLifecycleEventHookExecutionStatus',
              'ssm:GetParameter'
            ],
            resources: ['*'],
          }),
        ],
      })
    );
  }
}

export class EcsCanaryDeploymentStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: EcsCanaryDeploymentStackProps) {
    super(scope, id);

    const deploymentRoles = new DeploymentRoles(this, 'DeploymentRoles');

    // deployment configurations
    const canaryDeploymentConfig = new EcsDeploymentConfig(
      this, 'CanaryDeploymentConfig',
      {
        deploymentConfigName: 'Canary50Percent48Hours',
        trafficRoutingConfig: {
          type: 'TimeBasedCanary',
          timeBasedCanary: {
            canaryInterval: 2880,
            canaryPercentage: 50,
          },
        },
      }
    );
    const demoDeploymentConfig = new EcsDeploymentConfig(
      this, 'DemoDeploymentConfig',
      {
        deploymentConfigName: 'Canary50Percent2Minutes',
        trafficRoutingConfig: {
          type: 'TimeBasedCanary',
          timeBasedCanary: {
            canaryInterval: 2,
            canaryPercentage: 50,
          },
        },
      }
    );

    // deployment groups
    const latestDeploymentGroup = this.createDeploymentGroup(
      'latest',
      demoDeploymentConfig,
      props.networking.mainListener,
      props.networking.latestTargetGroupA,
      props.networking.latestTargetGroupB,
      props.ecs.latestEcsService,
      deploymentRoles.codeDeployRole
    )
    const stableDeploymentGroup = this.createDeploymentGroup(
      'stable',
      demoDeploymentConfig,
      props.networking.mainListener,
      props.networking.stableTargetGroupA,
      props.networking.stableTargetGroupB,
      props.ecs.stableEcsService,
      deploymentRoles.codeDeployRole
    )

    // lifecycle hook lambda
    const latestDeploymentHookFunction = this.createCodeDeployHookFunction(
      'latestDeployment',
      'functions/latest_deployment_hook',
      deploymentRoles.lifecycleHookLambdaRole
    );
    const stableDeploymentHookFunction = this.createCodeDeployHookFunction(
      'stableDeployment',
      'functions/stable_deployment_hook',
      deploymentRoles.lifecycleHookLambdaRole
    );

    // update files in ./assets
    this.updateAssets()

    // repositories
    const ecsCanaryRepository = new codecommit.Repository(this, 'EcsCanaryRepository', {
      repositoryName: 'EcsCanaryRepository',
      code: codecommit.Code.fromDirectory('./assets'),
    });
    const imageRepository = new ImageRepository(this, 'ImageRepository', {
      forceDelete: true,
    });

    // pipeline
    const ecsCanaryPipeline = new codepipeline.Pipeline(this, 'EcsCanaryPipeline', { pipelineName: 'ecs-canary' });
    const pipelineCfnResource = ecsCanaryPipeline.node.defaultChild as cdk.CfnResource;

    // artifacts
    const imageArtifact = new codepipeline.Artifact('ImageArtifact');
    const commitArtifact = new codepipeline.Artifact('CommitArtifact');

    // source stage
    const codeCommitSourceAction = new codepipeline_actions.CodeCommitSourceAction({
      actionName: 'CodeCommitSource',
      repository: ecsCanaryRepository,
      output: commitArtifact,
      trigger: codepipeline_actions.CodeCommitTrigger.POLL,
      branch: 'main',
    });
    const ecrSourceAction = new codepipeline_actions.EcrSourceAction({
      actionName: 'EcrSource',
      repository: imageRepository,
      imageTag: 'latest',
      output: imageArtifact,
    });
    ecsCanaryPipeline.addStage({
      stageName: 'Source',
      actions: [ecrSourceAction, codeCommitSourceAction],
    });

    // latest deploy stage
    const latestDeployAction = this.addDeployStageToPipeline(
      'latest',
      commitArtifact,
      imageArtifact,
      latestDeploymentGroup,
      ecsCanaryPipeline
    );

    // manual approval stage
    const manualApprovalAction = new codepipeline_actions.ManualApprovalAction({
      actionName: 'Approve',
    });
    ecsCanaryPipeline.addStage({
      stageName: 'Approve',
      actions: [manualApprovalAction],
    });

    // stable deploy stage
    const stableDeployAction = this.addDeployStageToPipeline(
      'stable',
      commitArtifact,
      imageArtifact,
      stableDeploymentGroup,
      ecsCanaryPipeline
    );
  }
  private createCodeDeployHookFunction(hookName: string, codePath: string, actuallambdaRole: iam.Role) {
    return new lambda.Function(this, `${hookName}Function`, {
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'lambda_function.lambda_handler',
      code: lambda.Code.fromAsset(codePath),
      functionName: `${hookName}HookFunction`,
      role: actuallambdaRole,
    });
  }
  private addDeployStageToPipeline(
    id: string,
    commitArtifact: codepipeline.Artifact,
    imageArtifact: codepipeline.Artifact,
    deploymentGroup: codedeploy.EcsDeploymentGroup,
    codePipeline: codepipeline.Pipeline,) {
    const deployAction = new codepipeline_actions.CodeDeployEcsDeployAction({
      actionName: 'CodeDeploy',
      taskDefinitionTemplateFile: commitArtifact.atPath(`taskdef.json`),
      appSpecTemplateFile: commitArtifact.atPath(`appspec-${id}.yaml`),
      containerImageInputs: [
        {
          input: imageArtifact,
          taskDefinitionPlaceholder: 'ImageURI',
        },
      ],
      deploymentGroup,
    });
    codePipeline.addStage({
      stageName: `${id}Deploy`,
      actions: [deployAction],
    });
    return deployAction
  }
  private createDeploymentGroup(
    id: string,
    deploymentConfig: EcsDeploymentConfig,
    listener: cdk.aws_elasticloadbalancingv2.ApplicationListener,
    blueTargetGroup: cdk.aws_elasticloadbalancingv2.ApplicationTargetGroup,
    greenTargetGroup: cdk.aws_elasticloadbalancingv2.ApplicationTargetGroup,
    service: cdk.aws_ecs.FargateService,
    role: iam.Role) {
    const ecsApplication = new codedeploy.EcsApplication(this, `${id}CodeDeployApplication`, {
      applicationName: `${id}Application`,
    });
    const deploymentGroup = new codedeploy.EcsDeploymentGroup(this, `${id}DeploymentGroup`, {
      service,
      blueGreenDeploymentConfig: {
        blueTargetGroup,
        greenTargetGroup,
        listener,
      },
      application: ecsApplication,
      deploymentConfig: deploymentConfig,
      role: role.withoutPolicyUpdates(),
      deploymentGroupName: `${id}DeploymentGroup`,
    });
    return deploymentGroup
  }
  private updateAssets() {
    const regExp = /(?<=::).*?(?=:)/ // match everything between "::" and ":" (account id in ARN)
    var taskDefinitionTemplateString = JSON.stringify(taskDefinitionTemplateFile);
    var taskDefinitionString = taskDefinitionTemplateString.replace(regExp, cdk.Stack.of(this).account);
    fs.writeFileSync('./assets/taskdef.json', taskDefinitionString, );
  }
}