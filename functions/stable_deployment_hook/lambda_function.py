import boto3


def get_ssm_param(name: str):
    return ssm.get_parameter(Name=name)["Parameter"]["Value"]


def lambda_handler(event, context):

    deploymentId = event["DeploymentId"]
    lifecycleEventHookExecutionId = event["LifecycleEventHookExecutionId"]
    try:
        response = elb.set_rule_priorities(
            RulePriorities=[
                {
                    'RuleArn': latest_rule_arn,
                    'Priority': 1
                }, {
                    'RuleArn': stable_rule_arn,
                    'Priority': 10
                },
            ]
        )

        response = ecs.update_service(
            cluster=cluster_arn,
            service=service_name,
            desiredCount=0,
        )

        response = codedeploy.put_lifecycle_event_hook_execution_status(
            deploymentId=deploymentId,
            lifecycleEventHookExecutionId=lifecycleEventHookExecutionId,
            status='Succeeded'
        )

    except Exception as e:
        print(e)
        response = codedeploy.put_lifecycle_event_hook_execution_status(
            deploymentId=deploymentId,
            lifecycleEventHookExecutionId=lifecycleEventHookExecutionId,
            status='Failed'
        )


ssm = boto3.client('ssm')
ecs = boto3.client('ecs')
elb = boto3.client('elbv2')
codedeploy = boto3.client('codedeploy')

cluster_arn = get_ssm_param('mainClusterArn')
service_name = get_ssm_param('stableServiceName')
stable_rule_arn = get_ssm_param('latestListenerRuleArn')
latest_rule_arn = get_ssm_param('stableListenerRuleArn')
