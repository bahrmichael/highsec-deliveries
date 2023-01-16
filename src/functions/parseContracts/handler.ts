import axios from "axios";
import {ddb} from "@libs/ddb-client";
import {PutCommand, QueryCommand} from "@aws-sdk/lib-dynamodb";
import {GetSecretValueCommand, SecretsManagerClient} from "@aws-sdk/client-secrets-manager";

const ssm = new SecretsManagerClient({});

const {USERS_TABLE, CONTRACTS_TABLE} = process.env;

async function getIdentityClient() {
    return axios.create({
        baseURL: `https://uc4v3lk6rh.execute-api.us-east-1.amazonaws.com/dev`,
        headers: {
            'x-api-key': await getSecret(),
            'Accept-Encoding': 'gzip,deflate,compress'
        }
    })
}

function getEsiClient(accessToken: string) {
    return axios.create({
        baseURL: `https://esi.evetech.net`,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Accept-Encoding': 'gzip,deflate,compress'
        }
    })
}

async function getSecret() {
    const secretResponse = await ssm.send(new GetSecretValueCommand({SecretId: 'highsec_deliveries'}))
    return JSON.parse(secretResponse.SecretString).eve_identity_key;
}

export const main = async () => {
    try {
        await axios.get(`https://esi.evetech.net/v2/status`);
    } catch (e) {
        console.error('ESI is down.', e);
        return;
    }

    const agents = (await ddb.send(new QueryCommand({
        TableName: USERS_TABLE,
        IndexName: 'esiScope',
        KeyConditionExpression: 'esiScope = :s',
        ExpressionAttributeValues: {
            ':s': `agent`,
        }
    }))).Items;

    const identityClient = await getIdentityClient();
    for (const agent of agents) {
        const {accessToken} = (await identityClient.get(`app/highsec-deliveries/character/${agent.characterId}/token`)).data;
        const esiClient = getEsiClient(accessToken);
        const contracts = (await esiClient.get(`/v1/characters/${agent.characterId}/contracts/`)).data;

        const latestContracts = (await ddb.send(new QueryCommand({
            TableName: CONTRACTS_TABLE,
            KeyConditionExpression: 'eveCharacterId = :i',
            ExpressionAttributeValues: {
                ':i': `${agent.characterId}`,
            },
            ScanIndexForward: false,
            Limit: 1,
        }))).Items;
        const latestId = latestContracts[0]?.contract_id ?? 0;

        const newContracts = contracts.filter((c) => c.contract_id > latestId);

        for (const newContract of newContracts) {
            const items = (await esiClient.get(`/v1/characters/${agent.characterId}/contracts/${newContract.contract_id}/items`)).data;

            await ddb.send(new PutCommand({
                TableName: CONTRACTS_TABLE,
                Item: {
                    eveCharacterId: `${agent.characterId}`,
                    contractId: `${newContract.contract_id}`,
                    ...newContract,
                    items,
                }
            }));
        }
    }
};
