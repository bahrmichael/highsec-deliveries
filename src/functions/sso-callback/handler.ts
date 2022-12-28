import {middyfy} from '@libs/lambda';
import {APIGatewayProxyEvent} from "aws-lambda";
import axios from "axios";
import {ddb} from "@libs/ddb-client";
import {GetCommand, PutCommand} from "@aws-sdk/lib-dynamodb";
import {GetSecretValueCommand, SecretsManagerClient} from "@aws-sdk/client-secrets-manager";

const ssm = new SecretsManagerClient({});

const {LOGIN_STATE_TABLE, USERS_TABLE, GUILD_ID, VERIFIED_ROLE_ID} = process.env;

const AUTH_API = `https://uc4v3lk6rh.execute-api.us-east-1.amazonaws.com/dev/auth`;

async function getSecret() {
  const secretResponse = await ssm.send(new GetSecretValueCommand({SecretId: 'highsec_deliveries_discord_bot_secret'}))
  return secretResponse.SecretString
}

async function getClient() {
  return axios.create({
    baseURL: `https://discord.com/api/v10`,
    headers: {
      Authorization: `Bot ${await getSecret()}`,
      'Accept-Encoding': 'gzip,deflate,compress'
    }
  })
}

const hello = async (event: APIGatewayProxyEvent) => {

  console.log(event.queryStringParameters);

  const state = event.queryStringParameters.state;

  const loginState = (await ddb.send(new GetCommand({
    TableName: LOGIN_STATE_TABLE,
    Key: {state}
  }))).Item;

  if (!loginState) {
    return {
      statusCode: 200,
      body: 'Login failed.',
      headers: {
        'Content-Type': 'text/html'
      }
    }
  }

  const {discordId, interactionId} = loginState;

  const {data} = await axios.get(`${AUTH_API}?code=${event.queryStringParameters.code}&appId=highsec-deliveries`);

  await ddb.send(new PutCommand({
    TableName: USERS_TABLE,
    Item: {
      pk: `discord#${discordId}`,
      sk: `eve#${data.characterId}`,
      characterName: data.characterName,
    }
  }))
  await ddb.send(new PutCommand({
    TableName: USERS_TABLE,
    Item: {
      pk: `eve#${data.characterId}`,
      sk: 'discord',
      characterName: data.characterName,
      discordId,
    }
  }))

  const discordClient = await getClient();
  await discordClient.put(`/guilds/${GUILD_ID}/members/${discordId}/roles/${VERIFIED_ROLE_ID}`)

  console.log({interactionId})
  // todo: update original message to disable login button
  // https://discord.com/developers/docs/interactions/receiving-and-responding#edit-original-interaction-response

  return {
    statusCode: 200,
    body: 'Login complete. You may close this window and return to Discord.',
    headers: {
      'Content-Type': 'text/html'
    }
  }
};

export const main = middyfy(hello);
