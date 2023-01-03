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
      OrdersTable: {
        Type: 'AWS::DynamoDB::Table',
        Properties: {
          BillingMode: 'PAY_PER_REQUEST',
          KeySchema: [{
            AttributeName: 'pk',
            KeyType: 'HASH'
          }],
          GlobalSecondaryIndexes: [{
            IndexName: 'orderOwner',
            KeySchema: [{
              AttributeName: 'orderOwner',
              KeyType: 'HASH'
            }, {
              AttributeName: 'pk',
              KeyType: 'RANGE'
            }],
            Projection: {
              ProjectionType: 'ALL'
            }
          }, {
            IndexName: 'assignedAgent',
            KeySchema: [{
              AttributeName: 'assignedAgent',
              KeyType: 'HASH'
            }, {
              AttributeName: 'pk',
              KeyType: 'RANGE'
            }],
            Projection: {
              ProjectionType: 'ALL'
            }
          }],
          AttributeDefinitions: [{
            AttributeName: 'pk',
            AttributeType: 'S',
          }, {
            AttributeName: 'orderOwner',
            AttributeType: 'S',
          }, {
            AttributeName: 'assignedAgent',
            AttributeType: 'S',
          }],
        }
      },
      TransactionsTable: {
        Type: 'AWS::DynamoDB::Table',
        Properties: {
          BillingMode: 'PAY_PER_REQUEST',
          KeySchema: [{
            AttributeName: 'pk',
            KeyType: 'HASH'
          }],
          AttributeDefinitions: [{
            AttributeName: 'pk',
            AttributeType: 'S',
          }],
          StreamSpecification: {
            StreamViewType: 'NEW_AND_OLD_IMAGES'
          },
        }
      },
      UsersTable: {
        Type: 'AWS::DynamoDB::Table',
        Properties: {
          BillingMode: 'PAY_PER_REQUEST',
          KeySchema: [{
            AttributeName: 'pk',
            KeyType: 'HASH'
          }, {
            AttributeName: 'sk',
            KeyType: 'RANGE'
          }],
          AttributeDefinitions: [{
            AttributeName: 'pk',
            AttributeType: 'S',
          }, {
            AttributeName: 'sk',
            AttributeType: 'S',
          }],
        }
      },
      LoginStateTable: {
        Type: 'AWS::DynamoDB::Table',
        Properties: {
          BillingMode: 'PAY_PER_REQUEST',
          KeySchema: [{
            AttributeName: 'state',
            KeyType: 'HASH'
          }],
          AttributeDefinitions: [{
            AttributeName: 'state',
            AttributeType: 'S',
          }],
          TimeToLiveSpecification: {
            Enabled: true,
            AttributeName: 'timetolive'
          }
        }
      },
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
