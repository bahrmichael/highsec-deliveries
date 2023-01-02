import {DynamoDBStreamEvent} from "aws-lambda";
import {unmarshall} from "@aws-sdk/util-dynamodb";
import {AttributeValue} from "@aws-sdk/client-dynamodb";
import {GetCommand, UpdateCommand} from "@aws-sdk/lib-dynamodb";
import {ddb} from "@libs/ddb-client";

const {USERS_TABLE, CORPORATION_ID} = process.env;

export const main = async (event: DynamoDBStreamEvent) => {
    const newTransactions: any[] = []
    for (const record of event.Records.map(({dynamodb}) => dynamodb).filter((r) => r.NewImage)) {
        console.log({record})
        newTransactions.push(unmarshall(record.NewImage as Record<string, AttributeValue>))
    }

    console.log({newTransactions})

    const deltaPerCharacter: Map<number, number> = new Map<number, number>();
    for (const t of newTransactions) {
        if (t.pk === 'latest') {
            continue;
        }
        if (t.ref_type) {
            const sign = t.first_party_id === +CORPORATION_ID ? -1 : 1;
            const characterId = t.first_party_id === +CORPORATION_ID ? t.second_party_id : t.first_party_id;
            deltaPerCharacter.set(characterId, (deltaPerCharacter.get(characterId) ?? 0) + (sign * t.amount));
            continue;
        }
        console.log('Unhandled transaction', t);
    }

    for (const [characterId, amount] of deltaPerCharacter.entries()) {
        const {discordId} = (await ddb.send(new GetCommand({
            TableName: USERS_TABLE,
            Key: { pk: `eve#${characterId}`, sk: 'discord' }
        }))).Item;

        await ddb.send(new UpdateCommand({
            TableName: USERS_TABLE,
            Key: { pk: `discord#${discordId}`, sk: 'balance' },
            UpdateExpression: 'set balance = balance + :a',
            ExpressionAttributeValues: {
                ':a': amount,
            }
        }))
    }
};