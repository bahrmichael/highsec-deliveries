import {formatJSONResponse} from '@libs/api-gateway';
import {middyfy} from '@libs/lambda';
import {verifyKey, InteractionType, InteractionResponseType} from 'discord-interactions';
import {ulid} from "ulid";
import {ddb} from "@libs/ddb-client";
import { PutCommand } from '@aws-sdk/lib-dynamodb';

const {PUBLIC_KEY, LOGIN_STATE_TABLE} = process.env;

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
      const state = ulid();

      const discordId = data.member.user.id;

      await ddb.send(new PutCommand({
        TableName: LOGIN_STATE_TABLE,
        Item: {
          state,
          interactionId,
          discordId,
          // one hour time to live
          timetolive: Math.ceil(new Date().getTime() / 1_000 + 60 * 60)
        }
      }))

      const callbackUrl = `https://6qhjjllnai.execute-api.us-east-1.amazonaws.com/20221227/sso-callback`;
      const signinUrl = `https://login.eveonline.com/v2/oauth/authorize/?response_type=code&redirect_uri=${callbackUrl}}&client_id=abce3c6539794647a0a31aa4492a7cb4&state=${state}`

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
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `TODO`,
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
                  custom_id: "confirm_order"
                },
                {
                  type: 2,
                  label: "Cancel",
                  style: 4,
                  custom_id: "cancel_order"
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
