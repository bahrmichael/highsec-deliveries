import {CloudFormationCustomResourceEvent} from "aws-lambda";
import axios from 'axios';
import {GetSecretValueCommand, SecretsManagerClient} from "@aws-sdk/client-secrets-manager";

const ssm = new SecretsManagerClient({});

const {VERSION, APPLICATION_ID} = process.env;

async function getClient() {
  return axios.create({
    baseURL: `https://discord.com/api/v10`,
    headers: {
      Authorization: `Bot ${await getSecret()}`
    }
  })
}

async function getSecret() {
  const secretResponse = await ssm.send(new GetSecretValueCommand({SecretId: 'highsec_deliveries_discord_bot_secret'}))
  return secretResponse.SecretString
}

async function writeCommands() {
  if (VERSION !== '20221227') {
    return;
  }

  const client = await getClient();

  const commands = [{
    "name": "blep",
    "type": 1,
    "description": "Send a random adorable animal photo",
  }]

  await client.put(`/applications/${APPLICATION_ID}/commands`, commands);
}

export const main = async (event: CloudFormationCustomResourceEvent, context: any) => {

  const requestType = event.RequestType;

  try {
    switch (requestType) {
      case "Create":
      case "Update":
        await writeCommands();
        break;
      // case "Delete":
      //   await deleteComamnds();
      //   break;
    }
    await sendResponse(event, context, "SUCCESS", {});
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