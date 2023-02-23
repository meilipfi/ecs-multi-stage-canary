#!/usr/bin/env node
// service imports
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ssm from 'aws-cdk-lib/aws-ssm';

// cdk imports
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NestedStackProps } from 'aws-cdk-lib';

export class NetworkingStack extends cdk.NestedStack {
  public vpc: ec2.Vpc;
  public alb: elbv2.ApplicationLoadBalancer;
  public latestTargetGroupA: elbv2.ApplicationTargetGroup;
  public latestTargetGroupB: elbv2.ApplicationTargetGroup;
  public stableTargetGroupA: elbv2.ApplicationTargetGroup;
  public stableTargetGroupB: elbv2.ApplicationTargetGroup;
  public mainListener: elbv2.ApplicationListener;
  constructor(scope: Construct, id: string, props?: NestedStackProps) {
    super(scope, id, props);

    // vpc
    this.vpc = new ec2.Vpc(this, 'MainVpc', { maxAzs: 2 });

    // target groups
    this.latestTargetGroupA = this.createApplicationTargetGroup(this.vpc, 'LatestTargetGroupA');
    this.latestTargetGroupB = this.createApplicationTargetGroup(this.vpc, 'LatestTargetGroupB');
    this.stableTargetGroupA = this.createApplicationTargetGroup(this.vpc, 'StableTargetGroupA');
    this.stableTargetGroupB = this.createApplicationTargetGroup(this.vpc, 'StableTargetGroupB');

    // alb
    const { alb, mainListener } = this.createApplicationLoadBalancer('Main', this.latestTargetGroupA, this.latestTargetGroupB, this.vpc);
    this.alb = alb; this.mainListener = mainListener;

    // alb listener rules
    const stableApplicationListenerRule = this.createApplicationListenerRule(
      'latest',
      this.mainListener,
      this.latestTargetGroupA,
      this.latestTargetGroupB,
      1,
      '*'
    );
    const latestApplicationListenerRule = this.createApplicationListenerRule(
      'stable',
      this.mainListener,
      this.stableTargetGroupA,
      this.stableTargetGroupB,
      10,
      '/app/123/*'
    );

    // ssm
    const stableListenerRuleArn = new ssm.StringParameter(this, 'StableListenerRuleArn', {
      parameterName: 'stableListenerRuleArn',
      stringValue: stableApplicationListenerRule.listenerRuleArn,
    });
    const latestListenerRuleArn = new ssm.StringParameter(this, 'LatestListenerRuleArn', {
      parameterName: 'latestListenerRuleArn',
      stringValue: latestApplicationListenerRule.listenerRuleArn,
    });

  }
  // cdk constructs
  private createApplicationLoadBalancer(
    id: string,
    latestTargetGroupA: elbv2.ApplicationTargetGroup,
    latestTargetGroupB: elbv2.ApplicationTargetGroup,
    vpc: ec2.Vpc,
  ) {
    const alb = new elbv2.ApplicationLoadBalancer(
      this, `${id}ApplicationLoadBalancer`,
      {
        vpc: this.vpc,
        vpcSubnets: { subnets: this.vpc.publicSubnets },
        internetFacing: true
      }
    );

    const albSG = new ec2.SecurityGroup(
      this, `${id}ApplicationLoadBalancerSG`,
      {
        vpc: this.vpc,
        allowAllOutbound: true,
      }
    );

    albSG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow https traffic'
    );

    alb.addSecurityGroup(albSG);

    const mainListener = alb.addListener(`${id}Listener`, {
      port: 80,
      defaultAction: elbv2.ListenerAction.weightedForward([
        {
          weight: 100,
          targetGroup: latestTargetGroupA,
        },
        {
          weight: 0,
          targetGroup: latestTargetGroupB,
        },
      ]),
    });

    return { alb, mainListener };
  }
  private createApplicationListenerRule(
    id: string,
    listener: elbv2.ApplicationListener,
    targetGroupA: elbv2.ApplicationTargetGroup,
    targetGroupB: elbv2.ApplicationTargetGroup,
    priority: number,
    pathPattern: string,
  ) {
    return new elbv2.ApplicationListenerRule(this, `${id}ApplicationListenerRule`, {
      listener: listener,
      priority: priority,
      action: elbv2.ListenerAction.weightedForward([
        {
          weight: 100,
          targetGroup: targetGroupA,
        },
        {
          weight: 0,
          targetGroup: targetGroupB,
        },
      ]),
      conditions: [
        elbv2.ListenerCondition.pathPatterns([pathPattern]),
      ],
    });
  }
  private createApplicationTargetGroup(vpc: ec2.Vpc, id: string) {
    return new elbv2.ApplicationTargetGroup(this, id, {
      port: 80,
      vpc,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
    });
  }
}