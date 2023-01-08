import {ddb} from "@libs/ddb-client";
import {GetCommand, QueryCommand, UpdateCommand} from "@aws-sdk/lib-dynamodb";
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

    const discordId = data.member.user.id;
    const openDeliveries = (await ddb.send(new QueryCommand({
        TableName: ORDERS_TABLE,
        IndexName: 'assignedAgent',
        KeyConditionExpression: 'assignedAgent = :o',
        FilterExpression: 'orderStatus = :s',
        ExpressionAttributeValues: {
            ':o': discordId,
            ':s': 'CLAIMED'
        }
    }))).Items;
    if (openDeliveries.length >= 10) {
        return {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: `You have 10 or more open deliveries. Please complete some of them first.`,
                // Make the response visible to only the user running the command
                flags: 64,
            }
        }
    }

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
                // Make the response visible to only the user running the command
                flags: 64,
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
        content: `An agent has accepted your order and your order ${orderId} is now in progress.`,
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