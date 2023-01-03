import {ddb} from "@libs/ddb-client";
import {GetCommand} from "@aws-sdk/lib-dynamodb";
import {InteractionResponseType} from "discord-interactions";

const { USERS_TABLE } = process.env;

export async function order(data: any): Promise<Record<string, unknown>> {
    const discordId = data.member.user.id;
    const balanceRecord = (await ddb.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: {pk: `discord#${discordId}`, sk: 'balance'}
    }))).Item;
    if (!(balanceRecord?.balance > 0)) {
        return {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: `To place an order you must first deposit ISK to \`Highsec Deliveries\`. Please link EVE characters with \`/signin\` and then transfer ISK from them to \`Highsec Deliveries\` to top up your balance. It may take up to 60 minutes for the balance to update. You can use \`/balance\` to check your current balance.`,
                // Make the response visible to only the user running the command
                flags: 64,
            }
        };
    }

    return{
        type: InteractionResponseType.APPLICATION_MODAL,
        data: {
            title: "Place an Order",
            custom_id: "order_modal",
            components: [{
                type: 1,
                components: [{
                    type: 4,
                    custom_id: "appraisal_link",
                    label: "Appraisal Link",
                    style: 1,
                    min_length: 28,
                    max_length: 35,
                    placeholder: "https://janice.e-351.com/a/eN8Fqp",
                    required: true
                }]
            }, {
                type: 1,
                components: [{
                    type: 4,
                    custom_id: "destination",
                    label: "Destination",
                    style: 1,
                    min_length: 10,
                    max_length: 300,
                    placeholder: "Jita IV - Moon 4 - Caldari Navy Assembly Plant",
                    required: true
                }]
            }, {
                type: 1,
                components: [{
                    type: 4,
                    custom_id: "recipient",
                    label: "Recipient (character or corporation)",
                    style: 1,
                    min_length: 1,
                    max_length: 300,
                    placeholder: "Your character's or corporation's name",
                    required: true
                }]
            }]
        }
    }
}