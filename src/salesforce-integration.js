const { config } = require("dotenv");
const { runAgent } = require("./agent");

config();

const instanceUrl = process.env.SF_INSTANCE_URL;
const accessToken = process.env.SF_ACCESS_TOKEN;
const apiVersion = process.env.SF_API_VERSION || "v60.0";

if (!instanceUrl || !accessToken) {
  throw new Error("Missing SF_INSTANCE_URL or SF_ACCESS_TOKEN in .env");
}

/**
 * Make authenticated requests to Salesforce
 */
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

/**
 * Get user info from Salesforce
 */
async function getSalesforceUserInfo() {
  return await salesforceRequest("/services/oauth2/userinfo");
}

/**
 * Query Salesforce using SOQL
 */
async function querySalesforce(soql) {
  const encodedQuery = encodeURIComponent(soql);
  return await salesforceRequest(
    `/services/data/${apiVersion}/query?q=${encodedQuery}`
  );
}

/**
 * Create a record in Salesforce
 */
async function createSalesforceRecord(sobjectType, fields) {
  return await salesforceRequest(
    `/services/data/${apiVersion}/sobjects/${sobjectType}/`,
    {
      method: "POST",
      body: JSON.stringify(fields)
    }
  );
}

/**
 * Update a record in Salesforce
 */
async function updateSalesforceRecord(sobjectType, recordId, fields) {
  return await salesforceRequest(
    `/services/data/${apiVersion}/sobjects/${sobjectType}/${recordId}`,
    {
      method: "PATCH",
      body: JSON.stringify(fields)
    }
  );
}

/**
 * Get a specific record from Salesforce
 */
async function getSalesforceRecord(sobjectType, recordId, fields = null) {
  let path = `/services/data/${apiVersion}/sobjects/${sobjectType}/${recordId}`;
  if (fields) {
    path += `?fields=${fields.join(",")}`;
  }
  return await salesforceRequest(path);
}

/**
 * Process a message through the agent and create a Salesforce record
 * @param {string} message - The incoming message
 * @param {object} options - Additional options (from, recordId, recordType, etc.)
 */
async function processMessageAndCreateRecord(message, options = {}) {
  const { from = "unknown", recordId = null, recordType = "Task" } = options;

  // Run the agent
  const agentResult = await runAgent(message, { from });

  // Prepare the response
  const response = {
    agentResult,
    salesforceRecordId: null,
    salesforceRecordUrl: null
  };

  // Create a Salesforce record with the response
  try {
    let recordData = {
      Description: `HR Agent Response\n\nQuery: ${message}\n\nResponse: ${
        agentResult.output || agentResult.text || "No response"
      }`,
      Priority: "Normal"
    };

    // If it's a Task
    if (recordType === "Task") {
      recordData.Subject = "HR Agent Response";
      recordData.Status = "Completed";
    }

    // If it's a Case
    if (recordType === "Case") {
      recordData.Subject = "HR Agent Inquiry";
      recordData.Status = "Resolved";
      recordData.Type = "Question";
      recordData.Comments = agentResult.output || agentResult.text || "No response";
    }

    const sfRecord = await createSalesforceRecord(recordType, recordData);
    response.salesforceRecordId = sfRecord.id || sfRecord.Id;
    response.salesforceRecordUrl = `https://${instanceUrl}/lightning/r/${recordType}/${response.salesforceRecordId}/view`;

    console.log(
      `Created ${recordType} record: ${response.salesforceRecordId}`
    );
  } catch (error) {
    console.error("Failed to create Salesforce record:", error.message);
    response.salesforceError = error.message;
  }

  return response;
}

/**
 * Get pending tasks/cases from Salesforce and process them
 */
async function processPendingSalesforceRecords(recordType = "Task", limit = 10) {
  try {
    const query = `
      SELECT Id, Subject, Description, CreatedDate
      FROM ${recordType}
      WHERE Status = 'Open' OR Status = 'New'
      ORDER BY CreatedDate DESC
      LIMIT ${limit}
    `;

    const result = await querySalesforce(query);
    const records = result.records || [];

    console.log(`Found ${records.length} pending ${recordType} records`);

    const processedRecords = [];

    for (const record of records) {
      try {
        const message = record.Description || record.Comments || record.Subject || "";
        const response = await processMessageAndCreateRecord(message, {
          recordType,
          recordId: record.Id
        });

        // Update the original record to mark it as processed
        await updateSalesforceRecord(recordType, record.Id, {
          Status: "Completed",
          Description: `${record.Description || ""}\n\n[PROCESSED BY HR AGENT]\nResponse: ${
            response.agentResult.output || response.agentResult.text || "No response"
          }`
        });

        processedRecords.push({
          recordId: record.Id,
          message,
          response: response.agentResult,
          salesforceRecordId: response.salesforceRecordId
        });
      } catch (error) {
        console.error(`Error processing record ${record.Id}:`, error.message);
      }
    }

    return processedRecords;
  } catch (error) {
    console.error("Error querying Salesforce:", error.message);
    throw error;
  }
}

module.exports = {
  salesforceRequest,
  getSalesforceUserInfo,
  querySalesforce,
  createSalesforceRecord,
  updateSalesforceRecord,
  getSalesforceRecord,
  processMessageAndCreateRecord,
  processPendingSalesforceRecords
};
