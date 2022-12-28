import {formatJSONResponse} from '@libs/api-gateway';
import {middyfy} from '@libs/lambda';
import {verifyKey, InteractionType, InteractionResponseType} from 'discord-interactions';
import {ulid} from "ulid";
import {ddb} from "@libs/ddb-client";
import {GetCommand, PutCommand, QueryCommand} from '@aws-sdk/lib-dynamodb';
import axios from "axios";
import {GetSecretValueCommand, SecretsManagerClient} from "@aws-sdk/client-secrets-manager";

const ssm = new SecretsManagerClient({});

const {PUBLIC_KEY, LOGIN_STATE_TABLE, USERS_TABLE} = process.env;

async function getJaniceSecret(): Promise<string> {
    const secretResponse = await ssm.send(new GetSecretValueCommand({SecretId: 'highsec_deliveries_janice_key'}))
    return secretResponse.SecretString
}

async function getJaniceClient() {
    return axios.create({
        baseURL: `https://janice.e-351.com/api/rest`,
        headers: {
            'X-ApiKey': await getJaniceSecret(),
            'Accept-Encoding': 'gzip,deflate,compress'
        }
    })
}

function getEsiClient() {
    return axios.create({
        baseURL: `https://esi.evetech.net`,
        headers: {
            'Accept-Encoding': 'gzip,deflate,compress'
        }
    })
}

function getPushxClient() {
    return axios.create({
        baseURL: `https://api.pushx.net/api`,
        headers: {
            'Accept-Encoding': 'gzip,deflate,compress'
        }
    })
}

function isVerified(headers: any, body: string | null): boolean {

    const signature = headers['x-signature-ed25519'];
    const timestamp = headers['x-signature-timestamp'];

    if (!signature || !timestamp || !body) {
        console.warn('Field missing.', {signature, timestamp, body})
        return false;
    }

    return verifyKey(
        body,
        signature,
        timestamp,
        PUBLIC_KEY
    );
}

const handler = async (event: any) => {

    if (!isVerified(event.headers, JSON.stringify(event.body))) {
        console.warn('Request is not verified')
        return {
            statusCode: 401,
            body: 'invalid request signature',
            headers: {
                'Content-Type': 'text/plain'
            }
        }
    }

    const data = event.body;

    console.log(data)

    if (data.type === InteractionType.PING) {
        console.info('Ack PONG')
        return formatJSONResponse({
            type: InteractionResponseType.PONG
        });
    } else if (data.type === InteractionType.APPLICATION_COMMAND) {
        console.log(data)

        const {data: interactionData, id: interactionId, token: interactionToken} = data;

        console.log({interactionId})

        const {name: command, options} = interactionData;

        console.log({options});

        if (command === 'signin') {
            const state = ulid();

            const discordId = data.member.user.id;

            await ddb.send(new PutCommand({
                TableName: LOGIN_STATE_TABLE,
                Item: {
                    state,
                    interactionId,
                    interactionToken,
                    discordId,
                    // one hour time to live
                    timetolive: Math.ceil(new Date().getTime() / 1_000 + 60 * 60)
                }
            }))

            const callbackUrl = `https://6qhjjllnai.execute-api.us-east-1.amazonaws.com/20221227/sso-callback`;
            const signinUrl = `https://login.eveonline.com/v2/oauth/authorize/?response_type=code&redirect_uri=${callbackUrl}&client_id=abce3c6539794647a0a31aa4492a7cb4&state=${state}`

            return formatJSONResponse({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `Please click on the button below to sign in with EVE Online.`,
                    // Make the response visible to only the user running the command
                    flags: 64,
                    components: [
                        {
                            type: 1,
                            components: [
                                {
                                    type: 2,
                                    label: "Sign in with EVE Online",
                                    style: 5,
                                    url: signinUrl
                                },
                            ]
                        }
                    ]
                }
            })
        } else if (command === 'order') {
            return formatJSONResponse({
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
                    }]
                    // {
                    //   type: 1,
                    //   components: [
                    //     {
                    //       type: 2,
                    //       label: "Confirm",
                    //       style: 3,
                    //       custom_id: "confirm_order"
                    //     },
                    //     {
                    //       type: 2,
                    //       label: "Cancel",
                    //       style: 4,
                    //       custom_id: "cancel_order"
                    //     }
                    //   ]
                    // }
                }
            })
        } else if (command === 'balance') {
            const discordId = data.member.user.id;

            const balanceRecord = (await ddb.send(new GetCommand({
                TableName: USERS_TABLE,
                Key: {pk: `discord#${discordId}`, sk: 'balance'}
            }))).Item;

            if (!balanceRecord) {
                return formatJSONResponse({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                        content: `You balance is 0 ISK. Please link a character with the command \`/signin\` and then transfer ISK from from it to \`Highsec Deliveries\` to top up your balance.`,
                        // Make the response visible to only the user running the command
                        flags: 64,
                    }
                });
            }

            let summary;
            if (balanceRecord.reserved > 0) {
                const available = new Intl.NumberFormat('en-US').format(balanceRecord.available);
                const reserved = new Intl.NumberFormat('en-US').format(balanceRecord.reserved);
                summary = `You have ${available} ISk available. ${reserved} is reserved by pending orders. Use the command \`/orders\` to show your orders.`
            } else {
                const available = new Intl.NumberFormat('en-US').format(balanceRecord.available);
                summary = `You have ${available} ISk available.`
            }

            return formatJSONResponse({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: summary,
                    // Make the response visible to only the user running the command
                    flags: 64,
                }
            });
        } else if (command === 'list-characters') {

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
                return formatJSONResponse({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                        content: `You have not verified any characters yet. Please use the command \`/signin\` to get started.`,
                        // Make the response visible to only the user running the command
                        flags: 64,
                    }
                })
            }

            const characterNames = items.map((i) => i.characterName).join('\n');

            return formatJSONResponse({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `You have verified the following characters:\n${characterNames}`,
                    // Make the response visible to only the user running the command
                    flags: 64,
                }
            })
        } else {
            return formatJSONResponse({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `I don't know how to handle the command "${command}".`,
                    // Make the response visible to only the user running the command
                    flags: 64,
                }
            })
        }
    } else if (data.type === InteractionType.MESSAGE_COMPONENT) {
        console.log(data)

        const {data: interactionData, id: interactionId} = data;

        console.log({interactionId})

        const {custom_id: customId} = interactionData;

        if (customId === 'confirm_order') {
            // todo: remove the previous message, or disable its buttons
            return formatJSONResponse({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `Thank you! An agent will soon pick up your order. We'll let you know when it's in progress.`,
                    // Make the response visible to only the user running the command
                    flags: 64,
                }
            })
        } else if (customId === 'cancel_order') {
            // todo: remove the previous message, or disable its buttons
            return formatJSONResponse({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `Your order has been cancelled.`,
                    // Make the response visible to only the user running the command
                    flags: 64,
                }
            })
        } else {
            return formatJSONResponse({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `I don't know how to handle the custom_id "${customId}".`,
                    // Make the response visible to only the user running the command
                    flags: 64,
                }
            })
        }
    } else if (data.type === InteractionType.APPLICATION_MODAL_SUBMIT) {

        const {data: interactionData, id: interactionId} = data;
        const {custom_id: customId, components} = interactionData;

        console.log({interactionId, components})

        console.log(JSON.stringify(components, null, 2))

        if (customId === 'order_modal') {
            try {
                const discordId = data.member.user.id;
                const balanceRecord = (await ddb.send(new GetCommand({
                    TableName: USERS_TABLE,
                    Key: {pk: `discord#${discordId}`, sk: 'balance'}
                }))).Item;

                if (!(balanceRecord?.available > 0)) {
                    throw Error(`Insufficient balance. Please link EVE characters with \`/signin\` and then transfer ISK from them to \`Highsec Deliveries\` to top up your balance. It may take up to 60 minutes for the balance to update. You can use \`/balance\` to check your current balance.`)
                }

                const result = await getOrderValues(components);

                let systemName;
                try {
                    const esiClient = getEsiClient();
                    const stationInfo = (await esiClient.get(`/v2/universe/stations/${result.destination.id}`)).data;
                    const {system_id} = stationInfo;
                    const systemInfo = (await esiClient.get(`/v4/universe/systems/${system_id}`)).data;
                    systemName = systemInfo.name;
                } catch (e) {
                    console.error(e);
                    throw Error(`Failed to resolve system name. Please try again.`);
                }

                const volume = result.janiceResult.totalVolume;
                const itemsValue = result.janiceResult.immediatePrices.totalSellPrice;

                let shippingFee;
                try {
                    const shippingResult = (await getPushxClient().get(`/quote/json/?startSystemName=Jita&endSystemName=${systemName}&volume=${volume}&collateral=${itemsValue}&apiClient=highsec-deliveries`)).data;
                    shippingFee = shippingResult.PriceNormal;
                } catch (e) {
                    console.error(e);
                    throw Error(`Failed to calculate the shipping fee. Please try again.`);
                }

                let summary = 'Here\'s a summary of your order. Please review it carefully before choosing to confirm or cancel it.\n';
                summary += `Items: ${new Intl.NumberFormat('en-US').format(itemsValue)} ISK (https://janice.e-351.com/a/${result.janiceResult.code})\n`
                summary += `Shipping to ${systemName}: ${new Intl.NumberFormat('en-US').format(shippingFee)} ISK\n`

                return formatJSONResponse({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                        content: summary,
                        // Make the response visible to only the user running the command
                        flags: 64,
                        components: [
                            {
                                type: 1,
                                components: [
                                    {
                                        type: 2,
                                        label: "Confirm",
                                        style: 3,
                                        custom_id: `confirm_order`
                                    },
                                    {
                                        type: 2,
                                        label: "Cancel",
                                        style: 4,
                                        custom_id: `cancel_order`
                                    },
                                ]
                            }
                        ]
                    }
                })
            } catch (e) {
                console.log(e)
                return formatJSONResponse({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                        content: e.message,
                        // Make the response visible to only the user running the command
                        flags: 64,
                    }
                })
            }

        } else {
            return formatJSONResponse({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `I don't know how to handle the modal customId "${customId}".`,
                    // Make the response visible to only the user running the command
                    flags: 64,
                }
            })
        }
    } else {
        return formatJSONResponse({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: `I don't know how to handle the interaction type "${event.body.type}".`,
                // Make the response visible to only the user running the command
                flags: 64,
            }
        })
    }
};

async function getOrderValues(components: any[]): Promise<{janiceResult: any, destination: { name: string, id: number }}> {
    const janiceLink = components.flatMap((c) => c.components).find((c) => c.custom_id === 'appraisal_link')?.value;
    console.log({janiceLink})
    const appraisalCode = extractId(janiceLink);
    console.log({appraisalCode})
    if (!appraisalCode) {
        throw Error(`The appraisal link \`${janiceLink}\`is invalid.`)
    }

    console.log('Requesting appraisal', {appraisalCode})

    let janiceResult;
    try {
        const janiceClient = await getJaniceClient();
        janiceResult = (await janiceClient.get(`/v2/appraisal/${appraisalCode}`)).data;
    } catch (e) {
        console.error(e);
        throw Error(`Failed to check the appraisal. Please try again.`);
    }

    const destinationValue = components.flatMap((c) => c.components).find((c) => c.custom_id === 'destination')?.value;
    let destinationResult;
    try {
        destinationResult = (await getEsiClient().post(`/v1/universe/ids/?datasource=tranquility`, [destinationValue])).data;
    } catch (e) {
        console.error(e);
        throw Error(`Failed to check the destination. Please try again.`);
    }

    if (destinationResult.stations?.length === 0) {
        throw Error(`The name doesn't seem to match any station. Are you sure there's no typo and it's an exact match?`);
    }
    const destination = destinationResult.stations[0];

    return {destination, janiceResult}
}

function extractId(url: string | undefined): string | null {
    if (!url) {
        return null;
    }
    const regex = /a\/([^/]*)/;
    const match = regex.exec(url);
    if (match) {
        return match[1];
    }
    return null;
}

export const main = middyfy(handler);
