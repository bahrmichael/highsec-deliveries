import {DynamoDBStreamEvent} from "aws-lambda";
import {unmarshall} from "@aws-sdk/util-dynamodb";
import {AttributeValue} from "@aws-sdk/client-dynamodb";
import {GetCommand, UpdateCommand} from "@aws-sdk/lib-dynamodb";
import {ddb} from "@libs/ddb-client";

const {USERS_TABLE, CORPORATION_ID} = process.env;

export const main = async (event: DynamoDBStreamEvent) => {
    const newTransactions: any[] = []
    for (const record of event.Records.map(({dynamodb}) => dynamodb).filter((r) => r.NewImage)) {
        newTransactions.push(unmarshall(record.NewImage as Record<string, AttributeValue>))
    }

    console.log({newTransactions})

    const deltaPerCharacter: Map<number, number> = new Map<number, number>();
    for (const t of newTransactions.filter((t) => t.ref_type)) {
        if (t.first_party_id === +CORPORATION_ID && t.second_party_id === +CORPORATION_ID) {
            console.log('Skipping internal transfer.');
            continue;
        }
        const sign = t.first_party_id === +CORPORATION_ID ? -1 : 1;
        const characterId = t.first_party_id === +CORPORATION_ID ? t.second_party_id : t.first_party_id;
        deltaPerCharacter.set(characterId, (deltaPerCharacter.get(characterId) ?? 0) + (sign * t.amount));
    }

    const deltaPerDiscordId: Map<string, number> = new Map<string, number>();
    for (const t of newTransactions.filter((t) => t.isInternalTransaction)) {
        deltaPerDiscordId.set(t.discordId, (deltaPerDiscordId.get(t.discordId) ?? 0) + t.amount);
    }

    for (const [characterId, amount] of deltaPerCharacter.entries()) {
        const characterRecord = (await ddb.send(new GetCommand({
            TableName: USERS_TABLE,
            Key: {pk: `eve#${characterId}`, sk: 'discord'}
        }))).Item;

        if (!characterRecord) {
            console.log(`Owner ${characterId} is not connected to any Discord user.`);
            continue;
        }

        deltaPerDiscordId.set(characterRecord.discordId, (deltaPerDiscordId.get(characterRecord.discordId) ?? 0) + amount);
    }

    for (const [discordId, amount] of deltaPerDiscordId.entries()) {
        await ddb.send(new UpdateCommand({
            TableName: USERS_TABLE,
            Key: { pk: `discord#${discordId}`, sk: 'balance' },
            UpdateExpression: 'set balance = if_not_exists(balance, :b) + :a',
            ExpressionAttributeValues: {
                ':a': amount,
                ':b': 0,
            }
        }));

        console.log(`Updated balance for Discord ${discordId} by ${amount}`);
    }
};
