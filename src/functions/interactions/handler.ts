import {formatJSONResponse} from '@libs/api-gateway';
import {middyfy} from '@libs/lambda';
import {InteractionResponseType, InteractionType, verifyKey} from 'discord-interactions';
import {signin} from './commands/signin';
import {order} from './commands/order';
import {balance} from "./commands/balance";
import {listCharacters} from "./commands/list-characters";
import {listOrders} from "./commands/list-orders";
import {confirmOrder} from "./commands/confirm-order";
import {cancelOrder} from "./commands/cancel-order";
import {takeOrder} from "./commands/take-order";
import {orderModal} from "./commands/order-modal";
import {listDeliveries} from "./commands/list-deliveries";

const {PUBLIC_KEY} = process.env;

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
        let res: Record<string, unknown>;
        switch (data.data.name) {
            case 'signin':
                res = await signin(data);
                break;
            case 'order':
                res = await order(data);
                break;
            case 'balance':
                res = await balance(data);
                break;
            case 'list-characters':
                res = await listCharacters(data);
                break;
            case 'list-orders':
                res = await listOrders(data);
                break;
            case 'list-deliveries':
                res = await listDeliveries(data);
                break;
            default:
                res = {
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                        content: `I don't know how to handle the command "${data.data.name}".`,
                        // Make the response visible to only the user running the command
                        flags: 64,
                    }
                };
        }
        return formatJSONResponse(res);
    } else if (data.type === InteractionType.MESSAGE_COMPONENT) {

        const customId = data.data.custom_id;

        if (customId.startsWith('confirm_order')) {
            return formatJSONResponse(await confirmOrder(data));
        } else if (customId.startsWith('cancel_order')) {
            return formatJSONResponse(await cancelOrder(data));
        } else if (customId.startsWith('take_order')) {
            return formatJSONResponse(await takeOrder(data));
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

        const customId = data.data.custom_id;

        if (customId === 'order_modal') {
            return formatJSONResponse(await orderModal(data));
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


export const main = middyfy(handler);
