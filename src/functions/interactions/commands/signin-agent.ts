import {ulid} from "ulid";
import {ddb} from "@libs/ddb-client";
import {PutCommand} from "@aws-sdk/lib-dynamodb";
import {InteractionResponseType} from "discord-interactions";

const {LOGIN_STATE_TABLE, API_ID, VERSION, ESI_CLIENT_ID} = process.env;

export async function signinAgent(data: any): Promise<Record<string, unknown>> {
    const state = ulid();

    const discordId = data.member.user.id;

    const {id: interactionId, token: interactionToken} = data;

    await ddb.send(new PutCommand({
        TableName: LOGIN_STATE_TABLE,
        Item: {
            state,
            interactionId,
            interactionToken,
            discordId,
            // one hour time to live
            timetolive: Math.ceil(new Date().getTime() / 1_000 + 60 * 60),
            esiScope: 'agent'
        }
    }))

    const callbackUrl = `https://${API_ID}.execute-api.us-east-1.amazonaws.com/${VERSION}/sso-callback`;
    const signinUrl = `https://login.eveonline.com/v2/oauth/authorize/?response_type=code&redirect_uri=${encodeURIComponent(callbackUrl)}&client_id=${ESI_CLIENT_ID}&state=${state}&scope=esi-wallet.read_corporation_wallets.v1`;

    return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: `Please click on the button below to grant additional ESI access for delivery agents.`,
            // Make the response visible to only the user running the command
            flags: 64,
            components: [
                {
                    type: 1,
                    components: [
                        {
                            type: 2,
                            label: "Grant additional ESI access for delivery agents",
                            style: 5,
                            url: signinUrl
                        },
                    ]
                }
            ]
        }
    }
}