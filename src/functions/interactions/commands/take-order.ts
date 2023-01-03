import {ddb} from "@libs/ddb-client";
import {GetCommand, UpdateCommand} from "@aws-sdk/lib-dynamodb";
import {InteractionResponseType} from "discord-interactions";
import axios from "axios";

const {ORDERS_TABLE, APPLICATION_ID} = process.env;

function getDiscordClient() {
    return axios.create({
        baseURL: `https://discord.com/api/v10`,
        headers: {
            'Accept-Encoding': 'gzip,deflate,compress'
        }
    })
}

export async function takeOrder(data: any): Promise<Record<string, unknown>> {

    const {data: interactionData} = data;
    const {custom_id: customId} = interactionData;

    const orderId = customId.split('#')[1];
    const order = (await ddb.send(new GetCommand({
        TableName: ORDERS_TABLE,
        Key: {pk: orderId}
    }))).Item;

    if (!order) {
        return {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: `We couldn't find the order anymore. The customer has probably cancelled the order since the bot posted it here.`,
            }
        }
    }
    if (order.orderStatus !== 'CONFIRMED') {
        return {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: `The order has already been taken.`,
                // Make the response visible to only the user running the command
                flags: 64,
            }
        }
    }

    const agentId = data.member.user.id;

    await ddb.send(new UpdateCommand({
        TableName: ORDERS_TABLE,
        Key: {pk: orderId},
        UpdateExpression: 'set orderStatus = :o, assignedAgent = :a',
        ExpressionAttributeValues: {
            ':o': 'CLAIMED',
            ':a': agentId,
        }
    }));

    await getDiscordClient().post(`/webhooks/${APPLICATION_ID}/${order.interactionToken}`, {
        content: 'An agent has accepted your order.',
        // Make the response visible to only the user running the command
        flags: 64,
    });

    return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: `<@${agentId}> has accepted the order.`,
        }
    }
}