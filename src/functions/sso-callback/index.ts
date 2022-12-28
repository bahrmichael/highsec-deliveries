import { handlerPath } from '@libs/handler-resolver';

export default {
  handler: `${handlerPath(__dirname)}/handler.main`,
  environment: {
    PUBLIC_KEY: '1f5a8789b7ac8c09dec2551c29bc088b747d7243f730117a838e419dbf1e5384',
    APPLICATION_ID: '1056632427054907392',
    LOGIN_STATE_TABLE: {Ref: 'LoginStateTable'},
    USERS_TABLE: {Ref: 'UsersTable'},
    VERIFIED_ROLE_ID: '1057613825874079785',
    GUILD_ID: '1057335108207661066'
  },
  events: [
    {
      http: {
        method: 'get',
        path: 'sso-callback',
      },
    },
  ],
  iamRoleStatements: [{
    Effect: 'Allow',
    Action: ['dynamodb:GetItem'],
    Resource: {'Fn::GetAtt': ['LoginStateTable', 'Arn']},
  }, {
    Effect: 'Allow',
    Action: ['dynamodb:PutItem'],
    Resource: {'Fn::GetAtt': ['UsersTable', 'Arn']},
  }, {
    Effect: 'Allow',
    Action: ['secretsmanager:GetSecretValue'],
    Resource: ['arn:aws:secretsmanager:${aws:region}:${aws:accountId}:secret:highsec_deliveries_discord_bot_secret-MTKpcQ'],
  }],
};
