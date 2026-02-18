#!/usr/bin/env node

/**
 * Salesforce Integration Testing Script
 * Tests the connection between local agent and Salesforce
 */

const http = require("http");

const BASE_URL = "http://localhost:4001";

function makeRequest(path, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json"
      }
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve({
            status: res.statusCode,
            data: data ? JSON.parse(data) : null
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            data
          });
        }
      });
    });

    req.on("error", reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function main() {
  console.log("🧪 Salesforce Integration Test Suite\n");

  try {
    // Test 1: Check Salesforce connection
    console.log("1️⃣  Testing Salesforce connection...");
    const healthResponse = await makeRequest("/salesforce/health");
    if (healthResponse.status === 200) {
      console.log("   ✅ Connected to Salesforce");
      console.log(`   👤 User: ${healthResponse.data.connectedAs}`);
      console.log(`   🏢 Instance: ${healthResponse.data.instanceUrl}\n`);
    } else {
      console.log("   ❌ Failed to connect to Salesforce");
      console.log(`   Error: ${healthResponse.data.error}\n`);
      process.exit(1);
    }

    // Test 2: Process a test message
    console.log("2️⃣  Processing test message through Salesforce...");
    const testMessage = "What is the PTO policy?";
    const processResponse = await makeRequest("/salesforce/process", "POST", {
      message: testMessage,
      recordType: "Task",
      from: "test-user"
    });

    if (processResponse.status === 200) {
      console.log("   ✅ Message processed successfully");
      console.log(`   📝 Query: "${testMessage}"`);
      console.log(`   🤖 Agent Response: ${processResponse.data.agentResult.output || processResponse.data.agentResult.text}`);
      console.log(`   📋 Salesforce Task ID: ${processResponse.data.salesforceRecordId}`);
      console.log(`   🔗 View: ${processResponse.data.salesforceRecordUrl}\n`);
    } else {
      console.log("   ❌ Failed to process message");
      console.log(`   Error: ${processResponse.data.error}\n`);
    }

    // Test 3: Check for pending tasks
    console.log("3️⃣  Checking for pending Salesforce Tasks...");
    const pendingResponse = await makeRequest(
      "/salesforce/process-pending",
      "POST",
      {
        recordType: "Task",
        limit: 5
      }
    );

    if (pendingResponse.status === 200) {
      const count = pendingResponse.data.processed || 0;
      console.log(`   ✅ Found and processed ${count} pending tasks\n`);

      if (count > 0) {
        pendingResponse.data.records.forEach((record, index) => {
          console.log(`   Task ${index + 1}:`);
          console.log(`     📝 Message: ${record.message}`);
          console.log(`     🤖 Response: ${record.response.output || record.response.text}`);
          console.log(`     📋 Created: ${record.salesforceRecordId}`);
        });
      }
    } else {
      console.log("   ℹ️  Could not process pending tasks");
      console.log(`   Info: ${pendingResponse.data.error}`);
    }

    console.log("\n✨ All tests completed!");
    console.log("\n📚 Integration Endpoints:");
    console.log("   GET  /salesforce/health              - Check Salesforce connection");
    console.log("   POST /salesforce/process              - Process message & create Task");
    console.log("   POST /salesforce/process-pending      - Process pending Salesforce records");
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    process.exit(1);
  }
}

main();
