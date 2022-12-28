import {formatJSONResponse} from '@libs/api-gateway';
import {middyfy} from '@libs/lambda';
import {verifyKey, InteractionType, InteractionResponseType} from 'discord-interactions';

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
    console.log(data)

    const {data: interactionData, id: interactionId} = data;

    console.log({interactionId})

    const {name: command, options} = interactionData;

    console.log({options});

    if (command === 'signin') {
      // todo: generate state
      return formatJSONResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `Please use this link to sign in with EVE Online: https://test.com`,
          // Make the response visible to only the user running the command
          flags: 64,
        }
      })
    } else if (command === 'order') {
      // todo: generate state
      return formatJSONResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `TODO`,
          // Make the response visible to only the user running the command
          flags: 64,
          "components": [
            {
              "type": 1,
              "components": [
                {
                  "type": 2,
                  "label": "Click me!",
                  "style": 1,
                  "custom_id": "click_one"
                }
              ]
            }
          ]
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
  }
};

export const main = middyfy(handler);
