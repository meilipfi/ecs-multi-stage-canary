# ECS Multi Stage Canary Deployment Sample

Sample cdk project, which enables multi-stage canary deployments for specific users based on ALB listener rules.

## Architecture overview
<img src="https://github.com/tobigs/ecs-multi-stage-canary/blob/main/docs/ecs-multi-stage-canary.png" width="350">

## Project structure
```
assets/                               -- Contains AppSpec and TaskDefiniton for deployments
docs/                                 -- Contains project documentation
functions/                            -- Contains code for lambda functions
images/                               -- Contains docker images to test deployments
cdk/                                  -- Contains all the cdk stacks
├── ecs-canary-deployment-stack.ts    -- Nested stack with ci/cd services for performing the multi-stage canary deployment
├── ecs-multi-stage-canary-stack.ts   -- Root stack utilizing the nested stack
├── ecs-multi-stage-canary.ts         -- CDK Application
├── ecs-stack.ts                      -- Nested stack with ECS related services
└── networking-stack.ts               -- Nested stack with networking services
```

## Usage
This project relies on [AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/home.html) and [TypeScript](https://www.typescriptlang.org/), for installation instructions look [here](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html#getting_started_install). 
For further information you can also checkout [this Workshop](https://cdkworkshop.com/) and [this Getting Started](https://aws.amazon.com/getting-started/guides/setup-cdk/).

## CDK Deployment
Run the following to deploy the stacks of the cdk template:
```
cdk deploy
```

## Canary Deployment
In Order to perform a multi-stage canary deployment you should follow the following steps.
1. Build image in /images using docker build
```
docker build images/race -t race
```
2. Push the image to the ECR repository, which was created within the ECS Stack as explained [here](https://docs.aws.amazon.com/AmazonECR/latest/userguide/docker-push-ecr-image.html).
As a result the deployment pipeline will be triggered.
This information can also be found within the ECR Console for each repository.
For example:
```
aws ecr get-login-password --region <REGION> | docker login --username AWS --password-stdin <ACCOUNT-ID>.dkr.ecr.<REGION>.amazonaws.com
docker tag race <ACCOUNT-ID>.dkr.ecr.<REGION>.amazonaws.com/<REPOSITORY-NAME>:latest
docker push <ACCOUNT-ID>.dkr.ecr.<REGION>.amazonaws.com/<REPOSITORY-NAME>:latest
```
The canary deployment can be verified by getting URL of the load balancer and enter the URL with /app/123/abc or without any path, in order to verify the canary deployment. 

3. Step 2 triggered the multi-stage canary deployment, in order to deploy to the second stage you have to approve the manual approval action within CodePipeline.


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
