import type { AWS } from '@serverless/typescript';

import * as functions from 'src/functions';

const serverlessConfiguration: AWS = {
  service: 'highsec-deliveries',
  frameworkVersion: '3',
  plugins: ['serverless-esbuild', 'serverless-iam-roles-per-function', 'serverless-plugin-log-retention'],
  provider: {
    name: 'aws',
    runtime: 'nodejs16.x',
    apiGateway: {
      minimumCompressionSize: 1024,
      shouldStartNameWithService: true,
    },
    environment: {
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      NODE_OPTIONS: '--enable-source-maps --stack-trace-limit=1000',
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
};

module.exports = serverlessConfiguration;
