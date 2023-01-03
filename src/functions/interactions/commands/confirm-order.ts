import {ddb} from "@libs/ddb-client";
import {GetCommand, PutCommand, UpdateCommand} from "@aws-sdk/lib-dynamodb";
import {InteractionResponseType} from "discord-interactions";
import axios from "axios";
import {ulid} from "ulid";

const {ORDERS_TABLE, USERS_TABLE, AGENT_WEBHOOK_ID, AGENT_WEBHOOK_TOKEN, TRANSACTIONS_TABLE} = process.env;

async function getDiscordWebhookAgentsClient() {
    return axios.create({
        baseURL: `https://discord.com/api/v10/webhooks/${AGENT_WEBHOOK_ID}/${AGENT_WEBHOOK_TOKEN}`,
        headers: {
            'Accept-Encoding': 'gzip,deflate,compress'
        }
    })
}

export async function confirmOrder(data: any): Promise<Record<string, unknown>> {
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
                content: `We couldn't find the order anymore. Please reach out to an Admin with the orderId ${orderId}.`,
                // Make the response visible to only the user running the command
                flags: 64,
            }
        }
    }

    const totalCost = order.shippingFee + order.serviceFee + order.itemsValue;

    const discordId = data.member.user.id;
    const balanceRecord = (await ddb.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: {pk: `discord#${discordId}`, sk: 'balance'}
    }))).Item;
    if (balanceRecord?.balance < totalCost) {
        const delta = new Intl.NumberFormat('en-US').format(totalCost - balanceRecord.balance);
        return {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: `Your wallet lacks ${delta} ISK for this order.\n\nPlease link EVE characters with \`/signin\` and then transfer ISK from them to \`Highsec Deliveries\` to top up your balance. It may take up to 60 minutes for the balance to update. You can use \`/balance\` to check your current balance.`,
                // Make the response visible to only the user running the command
                flags: 64,
            }
        }
    }

    await ddb.send(new UpdateCommand({
        TableName: ORDERS_TABLE,
        Key: {pk: orderId},
        UpdateExpression: 'set orderStatus = :o',
        ExpressionAttributeValues: {
            ':o': 'CONFIRMED'
        }
    }));
    await ddb.send(new PutCommand({
        TableName: TRANSACTIONS_TABLE,
        Item: {
            pk: ulid(),
            isInternalTransaction: true,
            amount: -1 * totalCost,
            orderId,
            discordId,
        }
    }))

    let agentMessage = ':truck: A new order is waiting!\n\n';
    agentMessage += `Appraisal: https://janice.e-351.com/a/${order.appraisalCode}\n`;
    agentMessage += `Destination: ${order.destinationName}\n`;
    agentMessage += `Items Value: ${new Intl.NumberFormat('en-US').format(order.itemsValue)}\n\n`;
    agentMessage += `:moneybag: Reward: ${new Intl.NumberFormat('en-US').format(order.shippingFee)}`;
    const discord = await getDiscordWebhookAgentsClient();
    await discord.post(``, {
        content: agentMessage,
        components: [
            {
                type: 1,
                components: [
                    {
                        type: 2,
                        label: "Take",
                        style: 3,
                        custom_id: `take_order#${orderId}`
                    },
                ]
            }
        ]
    });
    // todo: remove the previous message, or disable its buttons
    return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: `Thank you! An agent will soon pick up your order. We'll let you know when it's in progress.`,
            // Make the response visible to only the user running the command
            flags: 64,
        }
    }
}