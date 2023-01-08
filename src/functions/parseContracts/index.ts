import { handlerPath } from '@libs/handler-resolver';

export default {
  handler: `${handlerPath(__dirname)}/handler.main`,
  environment: {
    USERS_TABLE: {Ref: 'UsersTable'},
    CONTRACTS_TABLE: {Ref: 'ContractsTable'},
  },
  events: [
    {
      schedule: 'rate(5 minutes)',
    },
  ],
  iamRoleStatements: [{
    Effect: 'Allow',
    Action: ['dynamodb:Query'],
    Resource: [
      {'Fn::Join': [ '/', [{ 'Fn::GetAtt': ['UsersTable', 'Arn' ] }, 'index', 'esiScope' ]]},
    ]
  }, {
    Effect: 'Allow',
    Action: ['dynamodb:Query', 'dynamodb:PutItem'],
    Resource: {'Fn::GetAtt': ['ContractsTable', 'Arn']},
  }, {
    Effect: 'Allow',
    Action: ['secretsmanager:GetSecretValue'],
    Resource: ['arn:aws:secretsmanager:${aws:region}:${aws:accountId}:secret:highsec_deliveries-Fyg6NK'],
  }],
  tags: {
    function: 'parse-contracts'
  },
};
