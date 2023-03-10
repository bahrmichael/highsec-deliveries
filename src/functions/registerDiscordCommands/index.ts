import { handlerPath } from '@libs/handler-resolver';

export default {
  handler: `${handlerPath(__dirname)}/handler.main`,
  environment: {
    PUBLIC_KEY: '1f5a8789b7ac8c09dec2551c29bc088b747d7243f730117a838e419dbf1e5384',
    APPLICATION_ID: '1056632427054907392',
    VERSION: '${self:provider.stage}',
    AGENTS_CHANNEL_ID: '1059562759601262593',
    MANAGERS_CHANNEL_ID: '1059872357260476526'
  },
  iamRoleStatements: [
    {
      Effect: 'Allow',
      Action: ['secretsmanager:GetSecretValue'],
      Resource: ['arn:aws:secretsmanager:${aws:region}:${aws:accountId}:secret:highsec_deliveries-Fyg6NK'],
    }
  ],
  tags: {
    function: 'register-discord-commands'
  },
};
