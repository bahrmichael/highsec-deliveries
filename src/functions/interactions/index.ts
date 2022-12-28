import { handlerPath } from '@libs/handler-resolver';

export default {
  handler: `${handlerPath(__dirname)}/handler.main`,
  environment: {
    PUBLIC_KEY: '1f5a8789b7ac8c09dec2551c29bc088b747d7243f730117a838e419dbf1e5384',
    APPLICATION_ID: '1056632427054907392',
    LOGIN_STATE_TABLE: {Ref: 'LoginStateTable'},
    USERS_TABLE: {Ref: 'UsersTable'},
  },
  events: [
    {
      http: {
        method: 'post',
        path: 'interactions',
      },
    },
  ],
  iamRoleStatements: [{
    Effect: 'Allow',
    Action: ['dynamodb:PutItem'],
    Resource: {'Fn::GetAtt': ['LoginStateTable', 'Arn']},
  }, {
    Effect: 'Allow',
    Action: ['dynamodb:Query', 'dynamodb:GetItem'],
    Resource: {'Fn::GetAtt': ['UsersTable', 'Arn']},
  }, {
    Effect: 'Allow',
    Action: ['secretsmanager:GetSecretValue'],
    Resource: ['arn:aws:secretsmanager:${aws:region}:${aws:accountId}:secret:highsec_deliveries_janice_key-1C0mvC'],
  }],
  tags: {
    function: 'interactions'
  },
};
