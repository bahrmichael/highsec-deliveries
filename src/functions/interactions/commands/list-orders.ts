import {ddb} from "@libs/ddb-client";
import {QueryCommand} from "@aws-sdk/lib-dynamodb";
import {InteractionResponseType} from "discord-interactions";

const {ORDERS_TABLE} = process.env;

export async function listOrders(data: any): Promise<Record<string, unknown>> {

    const discordId = data.member.user.id;

    const orders = (await ddb.send(new QueryCommand({
        TableName: ORDERS_TABLE,
        IndexName: 'orderOwner',
        KeyConditionExpression: 'orderOwner = :o',
        ExpressionAttributeValues: {
            ':o': discordId,
        }
    }))).Items;

    if (!orders.length) {
        return {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: `You have no pending orders.`,
                // Make the response visible to only the user running the command
                flags: 64,
            }
        }
    }

    const ordersText = orders.map((order) => {
        if (['CONFIRMED', 'CLAIMED'].includes(order.orderStatus)) {
            return `#${order.pk} for ${order.recipient} in ${order.destinationName}`
        } else {
            return null;
        }
    }).filter((x) => x).join('\n');

    return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: `You have verified the following characters:\n\n${ordersText}`,
            // Make the response visible to only the user running the command
            flags: 64,
        }
    }
}