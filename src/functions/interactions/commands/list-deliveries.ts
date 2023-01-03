import {ddb} from "@libs/ddb-client";
import {QueryCommand} from "@aws-sdk/lib-dynamodb";
import {InteractionResponseType} from "discord-interactions";

const {ORDERS_TABLE} = process.env;

export async function listDeliveries(data: any): Promise<Record<string, unknown>> {

    const discordId = data.member.user.id;

    const orders = (await ddb.send(new QueryCommand({
        TableName: ORDERS_TABLE,
        IndexName: 'assignedAgent',
        KeyConditionExpression: 'assignedAgent = :a',
        ExpressionAttributeValues: {
            ':a': discordId,
        }
    }))).Items;

    if (!orders) {
        return {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: `You have no pending deliveries.`,
                // Make the response visible to only the user running the command
                flags: 64,
            }
        }
    }

    const embeds = [];
    for (const order of orders) {
        embeds.push({
            type: 'rich',
            title: `Order ${order.pk}`,
            description: `https://janice.e-351.com/a/${order.appraisalCode}`,
            color: 0x00FFFF,
            fields: [{
                name: `Destination`,
                value: order.destinationName,
                inline: true,
            }, {
                name: `Recipient`,
                value: order.recipient,
                inline: true,
            }/*, {
                name: `Delivery Until`,
                value: order.destinationName,
                inline: true,
            }*/]
        })
    }


    return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            embeds,
            "components": [
                {
                    "type": 1,
                    "components": [
                        {
                            "style": 3,
                            "label": `Complete order`,
                            "custom_id": `row_0_button_0`,
                            "disabled": false,
                            "type": 2
                        },
                        {
                            "style": 4,
                            "label": `Fail order`,
                            "custom_id": `row_0_button_1`,
                            "disabled": false,
                            "type": 2
                        }
                    ]
                }
            ],
            // Make the response visible to only the user running the command
            flags: 64,
        }
    }
}