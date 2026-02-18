const { config } = require("dotenv");

config();

const instanceUrl = process.env.SF_INSTANCE_URL;
const accessToken = process.env.SF_ACCESS_TOKEN;
const apiVersion = process.env.SF_API_VERSION || "v60.0";

if (!instanceUrl || !accessToken) {
  console.error("Missing SF_INSTANCE_URL or SF_ACCESS_TOKEN in .env");
  process.exit(1);
}

async function salesforceRequest(path, options = {}) {
  const url = `https://${instanceUrl}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    payload = text;
  }

  if (!response.ok) {
    const errorMessage = typeof payload === "string" ? payload : JSON.stringify(payload);
    throw new Error(`Salesforce error (${response.status}): ${errorMessage}`);
  }

  return payload;
}

async function main() {
  console.log("Checking Salesforce identity...");
  const identity = await salesforceRequest(`/services/oauth2/userinfo`);
  console.log(`Connected as ${identity.preferred_username || identity.name}`);

  console.log("Creating test task...");
  const task = await salesforceRequest(
    `/services/data/${apiVersion}/sobjects/Task/`,
    {
      method: "POST",
      body: JSON.stringify({
        Subject: "HR Agent Test Task",
        Description: "Created by local test script",
        Priority: "Normal"
      })
    }
  );

  console.log("Created Task Id:", task.id || task.Id || JSON.stringify(task));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
