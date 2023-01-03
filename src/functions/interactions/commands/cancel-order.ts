import {ddb} from "@libs/ddb-client";
import {DeleteCommand} from "@aws-sdk/lib-dynamodb";
import {formatJSONResponse} from "@libs/api-gateway";
import {InteractionResponseType} from "discord-interactions";

const {ORDERS_TABLE} = process.env;

export async function cancelOrder(data: any): Promise<Record<string, unknown>> {
    const {data: interactionData} = data;
    const {custom_id: customId} = interactionData;

    const orderId = customId.split('#')[1];

    await ddb.send(new DeleteCommand({
        TableName: ORDERS_TABLE,
        Key: {pk: orderId},
    }));

    // todo: remove the previous message, or disable its buttons
    return formatJSONResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: `Your order has been cancelled.`,
            // Make the response visible to only the user running the command
            flags: 64,
        }
    })
}