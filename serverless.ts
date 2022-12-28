import type { AWS } from '@serverless/typescript';

import * as functions from 'src/functions';
import {commands} from "./src/commands";

const serverlessConfiguration: AWS = {
  service: 'highsec-deliveries',
  frameworkVersion: '3',
  plugins: ['serverless-esbuild', 'serverless-iam-roles-per-function', 'serverless-plugin-log-retention'],
  provider: {
    name: 'aws',
    stage: '${opt:stage, "dev"}',
    runtime: 'nodejs16.x',
    apiGateway: {
      minimumCompressionSize: 1024,
      shouldStartNameWithService: true,
    },
    environment: {
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      NODE_OPTIONS: '--enable-source-maps --stack-trace-limit=1000',
    },
    stackTags: {
      projectGroup: 'highsec-deliveries',
      project: '${self:service}',
      stage: '${self:provider.stage}',
    },
    iam: {
      deploymentRole: 'arn:aws:iam::${aws:accountId}:role/${self:service}-CloudFormationExecutionRole'
    },
  },
  functions,
  package: { individually: true },
  custom: {
    logRetentionInDays: 7,
    esbuild: {
      bundle: true,
      minify: false,
      sourcemap: true,
      target: 'node16',
      define: { 'require.resolve': undefined },
      platform: 'node',
      concurrency: 10,
    },
  },
  resources: {
    Resources: {
      DiscordCommandsResource: {
        Type : "AWS::CloudFormation::CustomResource",
        Properties : {
          ServiceToken : { 'Fn::GetAtt': ['RegisterDiscordCommandsLambdaFunction', 'Arn' ] },
          Checksum: { 'Fn::Base64': JSON.stringify(commands) },
          Version: '${self:provider.stage}',
          ApplicationId: '1056632427054907392'
        },
      },
    }
  }
};

module.exports = serverlessConfiguration;
