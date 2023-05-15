# ECS Multi-Tenant Canary Deployment Sample

This sample CDK stack creates an implementation of a multi-tenant canary deployment with an application running containers in Amazon ECS. This implementation allows for routing specific users to the stable version by using ALB listener rules.

## Architecture Overview
<img src="https://github.com/tobigs/ecs-multi-stage-canary/blob/main/docs/ecs-multi-stage-canary.png" width="350">

## Project structure
```
assets/                               -- Contains AppSpec and TaskDefiniton for deployments
docs/                                 -- Contains project documentation
functions/                            -- Contains code for lambda functions
images/                               -- Contains docker images to test deployments
cdk/                                  -- Contains all the cdk stacks
├── ecs-canary-deployment-stack.ts    -- Nested stack with CI/CD services for performing the multi-tenant canary deployment
├── ecs-multi-stage-canary-stack.ts   -- Root stack utilizing the nested stack
├── ecs-multi-stage-canary.ts         -- CDK Application
├── ecs-stack.ts                      -- Nested stack with ECS related services
└── networking-stack.ts               -- Nested stack with networking services
```
## Services Used
- Amazon ECS
- Amazon ECR 
- Amazon CodeCommit
- Amazon CodeBuild
- Amazon CodeDeploy
- Amazon CodePipeline

## Usage
This project relies on [AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/home.html) and [TypeScript](https://www.typescriptlang.org/), for installation instructions look [here](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html#getting_started_install). 
For further information you can also checkout [this Workshop](https://cdkworkshop.com/) and [this Getting Started](https://aws.amazon.com/getting-started/guides/setup-cdk/).

## CDK Deployment
Run the following command to deploy the stacks of the cdk template in your AWS account:
```
cdk deploy
```

## Canary Deployment
In order to perform a multi-tenant canary deployment you should follow the following three steps: 
1. Build image in folder *images* using docker build
```
docker build images/race -t race
```
2. Push the image build in step 1 to the ECR repository. The ECR repository has been created within the ECS stack and can be found [here](https://console.aws.amazon.com/ecr/).  You can find the necessary commands in the AWS console by clicking *view push commands* after selecting the ECR repository. As a result the deployment pipeline in Amazon CodePipeline will be triggered. 
Alternatively use the commands below and substitute \<REGION>, \<ACCOUNT-ID>, and \<REPOSITORY NAME> with your own information. More information on the commands can be found [here](https://docs.aws.amazon.com/AmazonECR/latest/userguide/docker-push-ecr-image.html).
```
aws ecr get-login-password --region <REGION> | docker login --username AWS --password-stdin <ACCOUNT-ID>.dkr.ecr.<REGION>.amazonaws.com
docker tag race <ACCOUNT-ID>.dkr.ecr.<REGION>.amazonaws.com/<REPOSITORY-NAME>:latest
docker push <ACCOUNT-ID>.dkr.ecr.<REGION>.amazonaws.com/<REPOSITORY-NAME>:latest
```
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;The canary deployment can be verified by getting URL of the load balancer and enter the URL with /app/123/abc or without any path.

3. Step 2 triggered the multi-tenant canary deployment. You can check in Amazon CodePipeline that the first deployment stage has been successful. To deploy the second deployment stage you have to approve the manual approval action within Amazon CodePipeline. 


## Resources
* [Basic Overview of CodeDeploy](https://youtu.be/_EUZss7ZAS8)
* [Create a pipeline with an Amazon ECR source and ECS-to-CodeDeploy deployment](https://docs.aws.amazon.com/codepipeline/latest/userguide/tutorials-ecs-ecr-codedeploy.html)
* [How can I perform Blue/Green deployments for services hosted on Amazon ECS?](https://youtu.be/G8sLVIfZveY)
* [AppSpec 'hooks' section for an Amazon ECS deployment](https://docs.aws.amazon.com/codedeploy/latest/userguide/reference-appspec-file-structure-hooks.html#appspec-hooks-ecs)
* [Best practices for CI/CD using AWS Fargate and Amazon ECS](https://youtu.be/7FVK0i9edyg)
* [CodeDeploy Pricing](https://aws.amazon.com/codedeploy/pricing/)
* [CodePipeline Pricing](https://aws.amazon.com/codepipeline/pricing/)

# LICENSE
This project is licensed under the Apache-2.0 License.

# NOTICE
This is a sample solution intended as a starting point and should not be used in a productive setting without thorough analysis and considerations on the user's side.