import {CloudFormationCustomResourceEvent} from "aws-lambda";
import axios from 'axios';
import {GetSecretValueCommand, SecretsManagerClient} from "@aws-sdk/client-secrets-manager";
import {commands} from "../../commands";

const {AGENTS_CHANNEL_ID} = process.env;

const ssm = new SecretsManagerClient({});

async function getClient() {
  return axios.create({
    baseURL: `https://discord.com/api/v10`,
    headers: {
      Authorization: `Bot ${await getSecret()}`,
      'Accept-Encoding': 'gzip,deflate,compress'
    }
  })
}

async function getSecret() {
  const secretResponse = await ssm.send(new GetSecretValueCommand({SecretId: 'highsec_deliveries'}))
  return JSON.parse(secretResponse.SecretString).discord_bot_secret;
}

async function writeCommands(applicationId: string) {
  const client = await getClient();
  await client.put(`/applications/${applicationId}/commands`, commands);
}

async function addAgentsWebhook(): Promise<{id: string, token: string}> {
  const client = await getClient();
  const webhooks = (await client.get(`/channels/${AGENTS_CHANNEL_ID}/webhooks`)).data;
  const existingAgentsWebhook = webhooks?.find((webhook) => webhook.name === 'Orders');
  if (existingAgentsWebhook) {
    await client.delete(`/webhooks/${existingAgentsWebhook.id}`);
  }
  const webhookResult = (await client.post(`/channels/${AGENTS_CHANNEL_ID}/webhooks`, {
    name: 'Orders'
  })).data;

  return {id: webhookResult.id, token: webhookResult.token};
}

export const main = async (event: CloudFormationCustomResourceEvent, context: any) => {

  const requestType = event.RequestType;
  const {Version, ApplicationId} = event.ResourceProperties;

  console.log({requestType, Version, ApplicationId})

  try {
    let agentsWebhook;
    if (Version === '20221227') {
      switch (requestType) {
        case "Create":
        case "Update":
          await writeCommands(ApplicationId);
          agentsWebhook = await addAgentsWebhook();
          // break;
          // case "Delete":
          //   await deleteComamnds();
          //   break;
      }
    }
    const responseData = {}
    if (agentsWebhook) {
      responseData['AgentWebhookId'] = agentsWebhook.id;
      responseData['AgentWebhookToken'] = agentsWebhook.token;
    }
    console.log(responseData);
    await sendResponse(event, context, "SUCCESS", responseData);
  } catch (e) {
    console.error(e)
    await sendResponse(event, context, "FAILED", {}, e);
  }
};

// https://aws.plainenglish.io/simple-example-of-lambda-backed-custom-resource-in-aws-cloudformation-6cf2f9f1a101
// https://www.alexdebrie.com/posts/cloudformation-custom-resources/
async function sendResponse(event, context, responseStatus: 'FAILED' | 'SUCCESS', responseData, e?) {
  console.log("SENDING RESPONSE...\n", responseData);
  const reason = "See the details in CloudWatch Log Stream: " + context.logStreamName
  await axios.put(event.ResponseURL, {
    Status: responseStatus,
    Reason: (e ? e.message + " " + JSON.stringify(responseData) + " " : '') + reason,
    PhysicalResourceId: context.logStreamName,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: responseData,
  });
}