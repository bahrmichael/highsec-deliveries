import {middyfy} from '@libs/lambda';
import {APIGatewayProxyEvent} from "aws-lambda";
import axios from "axios";
import {ddb} from "@libs/ddb-client";
import {GetCommand, PutCommand} from "@aws-sdk/lib-dynamodb";
import {GetSecretValueCommand, SecretsManagerClient} from "@aws-sdk/client-secrets-manager";

const ssm = new SecretsManagerClient({});

const {LOGIN_STATE_TABLE, USERS_TABLE, GUILD_ID, VERIFIED_ROLE_ID, APPLICATION_ID, AGENT_ROLE_ID} = process.env;

const AUTH_API = `https://uc4v3lk6rh.execute-api.us-east-1.amazonaws.com/dev/auth`;

async function getSecret() {
    const secretResponse = await ssm.send(new GetSecretValueCommand({SecretId: 'highsec_deliveries'}))
    return JSON.parse(secretResponse.SecretString).discord_bot_secret;
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

    const {discordId, interactionToken, esiScope} = loginState;

    const {data} = await axios.get(`${AUTH_API}?code=${event.queryStringParameters.code}&appId=highsec-deliveries`);

    await ddb.send(new PutCommand({
        TableName: USERS_TABLE,
        Item: {
            pk: `discord#${discordId}`,
            sk: `eve#${data.characterId}`,
            characterName: data.name,
            characterId: data.characterId,
        }
    }));
    await ddb.send(new PutCommand({
        TableName: USERS_TABLE,
        Item: {
            pk: `eve#${data.characterId}`,
            sk: 'discord',
            characterName: data.name,
            characterId: data.characterId,
            discordId,
            esiScope,
        }
    }));

    const discordClient = await getClient();
    await discordClient.delete(`/webhooks/${APPLICATION_ID}/${interactionToken}/messages/@original`)

    if (esiScope === 'agent') {
        await discordClient.put(`/guilds/${GUILD_ID}/members/${discordId}/roles/${AGENT_ROLE_ID}`)
        await discordClient.post(`/webhooks/${APPLICATION_ID}/${interactionToken}`, {
            content: `You have successfully granted additional ESI access for the character ${data.name}.`,
            // Make the response visible to only the user running the command
            flags: 64,
        })
    } else {
        await discordClient.put(`/guilds/${GUILD_ID}/members/${discordId}/roles/${VERIFIED_ROLE_ID}`)
        await discordClient.post(`/webhooks/${APPLICATION_ID}/${interactionToken}`, {
            content: `You have successfully verified the character ${data.name} and can now place orders with the command \`/order\`.`,
            // Make the response visible to only the user running the command
            flags: 64,
        })
    }

    return {
        statusCode: 200,
        body: 'Login complete. You may close this window and return to Discord.',
        headers: {
            'Content-Type': 'text/html'
        }
    }
};

export const main = middyfy(hello);
