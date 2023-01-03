import {ddb} from "@libs/ddb-client";
import {GetCommand} from "@aws-sdk/lib-dynamodb";
import {InteractionResponseType} from "discord-interactions";

const {USERS_TABLE} = process.env;

export async function balance(data: any): Promise<Record<string, unknown>> {
    const discordId = data.member.user.id;

    const balanceRecord = (await ddb.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: {pk: `discord#${discordId}`, sk: 'balance'}
    }))).Item;

    if (!balanceRecord) {
        return {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: `You balance is 0 ISK. Please link a character with the command \`/signin\` and then transfer ISK from from it to \`Highsec Deliveries\` to top up your balance.`,
                // Make the response visible to only the user running the command
                flags: 64,
            }
        };
    }

    let summary;
    if (balanceRecord.reserved > 0) {
        const available = new Intl.NumberFormat('en-US').format(balanceRecord.balance);
        const reserved = new Intl.NumberFormat('en-US').format(balanceRecord.reserved);
        summary = `You have ${available} ISK available. ${reserved} is reserved by pending orders or payouts. Use the command \`/list-orders\` to show your orders.`
    } else {
        const available = new Intl.NumberFormat('en-US').format(balanceRecord.balance);
        summary = `You have ${available} ISK available.`
    }

    return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: summary,
            // Make the response visible to only the user running the command
            flags: 64,
        }
    };
}