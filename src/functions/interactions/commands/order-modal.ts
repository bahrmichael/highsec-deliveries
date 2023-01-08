import {ddb} from "@libs/ddb-client";
import {GetCommand, PutCommand} from "@aws-sdk/lib-dynamodb";
import {InteractionResponseType} from "discord-interactions";
import {ulid} from "ulid";
import {GetSecretValueCommand, SecretsManagerClient} from "@aws-sdk/client-secrets-manager";
import axios from "axios";

const ssm = new SecretsManagerClient({});

const {USERS_TABLE, ORDERS_TABLE} = process.env;

async function getJaniceSecret(): Promise<string> {
    const secretResponse = await ssm.send(new GetSecretValueCommand({SecretId: 'highsec_deliveries'}))
    return JSON.parse(secretResponse.SecretString).janice_key;
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

export async function orderModal(data: any): Promise<Record<string, unknown>> {
    try {
        const discordId = data.member.user.id;
        const balanceRecord = (await ddb.send(new GetCommand({
            TableName: USERS_TABLE,
            Key: {pk: `discord#${discordId}`, sk: 'balance'}
        }))).Item;
        if (!(balanceRecord?.balance > 0)) {
            return {
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `Insufficient balance. Please link EVE characters with \`/signin\` and then transfer ISK from them to \`Highsec Deliveries\` to top up your balance. It may take up to 60 minutes for the balance to update. You can use \`/balance\` to check your current balance.`,
                    // Make the response visible to only the user running the command
                    flags: 64,
                }
            }
        }

        const components = data.data.components;

        const {destination, janiceResult, recipient} = await getOrderValues(components);

        let systemName;
        try {
            const esiClient = getEsiClient();
            const stationInfo = (await esiClient.get(`/v2/universe/stations/${destination.id}`)).data;
            const {system_id} = stationInfo;
            const systemInfo = (await esiClient.get(`/v4/universe/systems/${system_id}`)).data;
            systemName = systemInfo.name;
        } catch (e) {
            console.error(e);
            return {
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `Failed to resolve station or system. Please make sure the name is correct and try again.`,
                    // Make the response visible to only the user running the command
                    flags: 64,
                }
            }
        }

        const volume = janiceResult.totalVolume;
        const itemsValue = janiceResult.immediatePrices.totalSellPrice;
        if (itemsValue < 100_000_000) {
            return {
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `Your order must be at least 100m ISK worth.`,
                    // Make the response visible to only the user running the command
                    flags: 64,
                }
            };
        }

        if (volume > 1_126_500 && itemsValue > 3_000_000_000) {
            return {
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `The order must not exceed both 1,126,500m³ and 3b ISK.`,
                    // Make the response visible to only the user running the command
                    flags: 64,
                }
            }
        } else if (volume > 360_000 && itemsValue > 50_000_000_000) {
            return {
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `The order must not exceed both 360,000m³ and 50b ISK.`,
                    // Make the response visible to only the user running the command
                    flags: 64,
                }
            }
        } else if (volume > 62_500 && itemsValue > 10_000_000_000) {
            return {
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `The order must not exceed both 62,500m³ and 10b ISK.`,
                    // Make the response visible to only the user running the command
                    flags: 64,
                }
            }
        } else if (volume > 12_500 && itemsValue > 30_000_000_000) {
            return {
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `The order must not exceed both 12,500m³ and 30b ISK.`,
                    // Make the response visible to only the user running the command
                    flags: 64,
                }
            }
        }

        let shippingFee;
        try {
            const shippingResult = (await getPushxClient().get(`/quote/json/?startSystemName=Jita&endSystemName=${systemName}&volume=${volume}&collateral=${itemsValue}&apiClient=highsec-deliveries`)).data;
            shippingFee = shippingResult.PriceNormal;
        } catch (e) {
            console.error(e);
            return {
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `Failed to calculate the shipping fee. Please try again.`,
                    // Make the response visible to only the user running the command
                    flags: 64,
                }
            }
        }

        const serviceFee = itemsValue * 0.02;

        const totalCost = shippingFee + itemsValue + serviceFee;

        const orderId = ulid();
        await ddb.send(new PutCommand({
            TableName: ORDERS_TABLE,
            Item: {
                pk: orderId,
                appraisalCode: janiceResult.code,
                itemsValue,
                destinationName: destination.name,
                destinationId: destination.id,
                orderStatus: 'PENDING',
                shippingFee,
                serviceFee,
                orderOwner: discordId,
                recipient,
            }
        }))

        return {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: 'Here\'s a summary of your order. Please review it carefully before confirming it. Otherwise just discard this message.',
                embeds: [
                    {
                        "type": "rich",
                        "title": `Order ${orderId}`,
                        "description": `https://janice.e-351.com/a/${janiceResult.code}`,
                        "color": 0x00FFFF,
                        "fields": [
                            {
                                "name": `Items`,
                                "value": `${new Intl.NumberFormat('en-US').format(itemsValue)} ISK`
                            },
                            {
                                "name": `Shipping to ${systemName}`,
                                "value": `${new Intl.NumberFormat('en-US').format(shippingFee)} ISK`
                            },
                            {
                                "name": `Service Fee`,
                                "value": `${new Intl.NumberFormat('en-US').format(serviceFee)} ISK`
                            },
                            {
                                "name": `Total`,
                                "value": `${new Intl.NumberFormat('en-US').format(totalCost)} ISK`
                            },
                            {
                                "name": `Recipient`,
                                "value": `${recipient}`
                            }
                        ]
                    }
                ],
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
                                custom_id: `confirm_order#${orderId}`
                            },
                        ]
                    }
                ]
            }
        }
    } catch (e) {
        console.log(e)
        return {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: e.message,
                // Make the response visible to only the user running the command
                flags: 64,
            }
        }
    }

}


async function getOrderValues(components: any[]): Promise<{ janiceResult: any, destination: { name: string, id: number }, recipient: string }> {
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
        destinationResult = (await getEsiClient().post(`/v1/universe/ids/?datasource=tranquility`, [destinationValue.trim()])).data;
    } catch (e) {
        console.error(e);
        throw Error(`Failed to check the destination. Please try again.`);
    }

    if (destinationResult.stations?.length === 0) {
        throw Error(`The name doesn't seem to match any station. Are you sure there's no typo and it's an exact match?`);
    }
    const destination = destinationResult.stations[0];

    const recipient = components.flatMap((c) => c.components).find((c) => c.custom_id === 'recipient')?.value;

    return {destination, janiceResult, recipient}
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