import { handlerPath } from '@libs/handler-resolver';

export default {
  handler: `${handlerPath(__dirname)}/handler.main`,
  environment: {
    USERS_TABLE: {Ref: 'UsersTable'},
    CORPORATION_ID: '98729855',
  },
  events: [
    {
      stream: {
        type: 'dynamodb',
        arn: {'Fn::GetAtt': ['TransactionsTable', 'StreamArn']}
      }
    },
  ],
  iamRoleStatements: [
    {
      Effect: 'Allow',
      Action: ['dynamodb:UpdateItem', 'dynamodb:GetItem'],
      Resource: { 'Fn::GetAtt': ['UsersTable', 'Arn' ] },
    },
  ],
  tags: {
    function: 'update-balance'
  },
};
