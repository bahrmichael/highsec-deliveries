import {ddb} from "@libs/ddb-client";
import {QueryCommand} from "@aws-sdk/lib-dynamodb";
import {InteractionResponseType} from "discord-interactions";

const {USERS_TABLE} = process.env;

export async function listCharacters(data: any): Promise<Record<string, unknown>> {

    const discordId = data.member.user.id;

    const items = (await ddb.send(new QueryCommand({
        TableName: USERS_TABLE,
        KeyConditionExpression: 'pk = :p and begins_with(sk, :s)',
        ExpressionAttributeValues: {
            ':p': `discord#${discordId}`,
            ':s': `eve#`,
        }
    }))).Items;

    if (!items) {
        return {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: `You have not verified any characters yet. Please use the command \`/signin\` to get started.`,
                // Make the response visible to only the user running the command
                flags: 64,
            }
        }
    }

    const characterNames = items.map((i) => i.characterName).join('\n');

    return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: `You have verified the following characters:\n${characterNames}`,
            // Make the response visible to only the user running the command
            flags: 64,
        }
    }
}