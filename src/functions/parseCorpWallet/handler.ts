import axios from "axios";
import {ddb} from "@libs/ddb-client";
import {GetCommand, PutCommand} from "@aws-sdk/lib-dynamodb";
import {GetSecretValueCommand, SecretsManagerClient} from "@aws-sdk/client-secrets-manager";
import {ulid} from "ulid";

const ssm = new SecretsManagerClient({});

const {TRANSACTIONS_TABLE, CORPORATION_ID, CEO_CHARACTER_ID} = process.env;

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
    const latestIdRecord = (await ddb.send(new GetCommand({
        TableName: TRANSACTIONS_TABLE,
        Key: {pk: 'latest'}
    }))).Item;
    const latestId = latestIdRecord?.latestId ?? 0;

    const identityClient = await getIdentityClient();
    const {accessToken} = (await identityClient.get(`app/highsec-deliveries/character/${CEO_CHARACTER_ID}/token`)).data;
    const esiClient = getEsiClient(accessToken);

    const journalPromises: Promise<any>[] = [];
    for (let division = 1; division < 7; division++) {
        journalPromises.push(esiClient.get(`/corporations/${CORPORATION_ID}/wallets/${division}/journal`));
    }
    const journalRecords: any[] = (await Promise.all(journalPromises)).map((res) => res.data).flatMap((x) => x);
    // The log below should show us if the flatMap worked as expected
    console.log({journalRecords: journalRecords.length})

    const newJournalRecords: any[] = journalRecords.filter(({id}) => id > latestId);
    if (newJournalRecords.length === 0) {
        console.log("No new journal records.");
        return;
    }
    const newLatestId = Math.max(...newJournalRecords.map(({id}) => id));

    const writeCommands = [];
    for (const journalRecord of journalRecords) {
        writeCommands.push(ddb.send(new PutCommand({
            TableName: TRANSACTIONS_TABLE,
            Item: {
                ...journalRecord,
                pk: ulid(),
            },
        })))
    }
    writeCommands.push(ddb.send(new PutCommand({
        TableName: TRANSACTIONS_TABLE,
        Item: {
            pk: 'latest',
            latestId: newLatestId,
        }
    })))
    await Promise.all(writeCommands);
};
