import { handlerPath } from '@libs/handler-resolver';

export default {
  handler: `${handlerPath(__dirname)}/handler.main`,
  environment: {
    TRANSACTIONS_TABLE: {Ref: 'TransactionsTable'},
    CORPORATION_ID: '98729855',
    CEO_CHARACTER_ID: '2120757688',
  },
  events: [
    {
      schedule: 'rate(1 hour)',
    },
  ],
  iamRoleStatements: [{
    Effect: 'Allow',
    Action: ['dynamodb:PutItem', 'dynamodb:GetItem'],
    Resource: {'Fn::GetAtt': ['TransactionsTable', 'Arn']},
  }, {
    Effect: 'Allow',
    Action: ['secretsmanager:GetSecretValue'],
    Resource: ['arn:aws:secretsmanager:${aws:region}:${aws:accountId}:secret:highsec_deliveries-Fyg6NK'],
  }],
  tags: {
    function: 'parse-corp-wallet'
  },
  timeout: 60,
};
