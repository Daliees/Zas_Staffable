const express = require("express");
const { config } = require("dotenv");
const path = require("path");
const { runAgent } = require("./agent");
const {
  processPendingSalesforceRecords,
  processMessageAndCreateRecord,
  getSalesforceUserInfo
} = require("./salesforce-integration");

config();

const app = express();
app.use(express.json({ limit: "1mb" }));

const getNodeRedUrl = () =>
  process.env.NODERED_URL ||
  process.env.FLOWFUSE_WEBHOOK_URL ||
  "http://127.0.0.1:1880/webhook/whatsapp";

// Serve static files from the web directory
app.use(express.static(path.join(__dirname, "..", "web")));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/config", (_req, res) => {
  res.json({
    webhookUrl: "/webhook/whatsapp",
    nodeRedTarget: getNodeRedUrl()
  });
});

// Webhook endpoint for the chat interface to send messages to.
// 1. Calls the local AI agent to get a real reply.
// 2. Optionally forwards the agent result to FlowFuse/Node-RED for
//    downstream processing (Salesforce task creation, logging, etc.).
app.post("/webhook/whatsapp", async (req, res) => {
  try {
    const message = req.body?.Body || req.body?.text || "";
    const from = req.body?.From || req.body?.from || "";
    console.log("/webhook/whatsapp incoming", { from, text: message.slice(0, 200) });

    // ── Step 1: Run the AI agent locally ──────────────────────────
    const agentResult = await runAgent(message, { from });
    console.log("/webhook/whatsapp agent result", agentResult);

    // ── Step 2: Forward agent result to FlowFuse (fire-and-forget) ─
    const nodeRedUrl = getNodeRedUrl();
    if (nodeRedUrl) {
      try {
        const fetch = require("node-fetch");
        fetch(nodeRedUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...req.body, agentResult })
        }).catch(err => console.error("FlowFuse forward error (non-blocking):", err.message));
        console.log("/webhook/whatsapp forwarded to FlowFuse:", nodeRedUrl);
      } catch (fwdErr) {
        console.error("FlowFuse forward error:", fwdErr.message);
      }
    }

    // ── Step 3: Build a human-friendly reply ─────────────────────
    let reply = agentResult.reply;
    if (!reply || reply.trim() === "") {
      if (agentResult.action === "create_salesforce_task") {
        const t = agentResult.task || {};
        reply = `Got it — I've prepared a Salesforce task "${t.subject || "Follow-up"}" (priority: ${t.priority || "Normal"}).`;
        if (t.dueDate) reply += ` Due date: ${t.dueDate}.`;
      } else {
        reply = "I'm not sure how to help with that. Could you rephrase?";
      }
    }

    // ── Step 4: Return the AI reply immediately ───────────────────
    res.json({
      reply,
      action: agentResult.action || "unknown",
      task: agentResult.task || {},
      from
    });
  } catch (error) {
    console.error("/webhook/whatsapp error:", error);
    res.status(500).json({
      error: "AgentError",
      message: error.message,
      reply: "Sorry, I encountered an error processing your request."
    });
  }
});

// Legacy endpoint for backward compatibility
app.post("/agent", async (req, res) => {
  try {
    const message = req.body?.text || req.body?.message || "";
    const from = req.body?.from || req.body?.From || "";
    console.log("/agent request", { from, message: message.slice(0, 200) });

    const result = await runAgent(message, { from });
    res.json({ ...result, from });
  } catch (error) {
    res.status(500).json({
      error: "AgentError",
      message: error.message
    });
  }
});

// ==================== SALESFORCE INTEGRATION ====================

// Check Salesforce connection
app.get("/salesforce/health", async (_req, res) => {
  try {
    const userInfo = await getSalesforceUserInfo();
    res.json({
      ok: true,
      connectedAs: userInfo.preferred_username || userInfo.name,
      orgId: userInfo.organization_id,
      instanceUrl: process.env.SF_INSTANCE_URL
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// Process a message and create a Salesforce record
app.post("/salesforce/process", async (req, res) => {
  try {
    const message = req.body?.message || "";
    const recordType = req.body?.recordType || "Task";
    const from = req.body?.from || "salesforce-user";

    if (!message) {
      return res.status(400).json({
        error: "Missing message field"
      });
    }

    const result = await processMessageAndCreateRecord(message, {
      from,
      recordType
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: "ProcessingError",
      message: error.message
    });
  }
});

// Process pending Salesforce records (Tasks or Cases)
app.post("/salesforce/process-pending", async (req, res) => {
  try {
    const recordType = req.body?.recordType || "Task";
    const limit = req.body?.limit || 10;

    const results = await processPendingSalesforceRecords(recordType, limit);

    res.json({
      processed: results.length,
      records: results
    });
  } catch (error) {
    res.status(500).json({
      error: "ProcessingError",
      message: error.message
    });
  }
});

// ==================== END SALESFORCE INTEGRATION ====================

const port = Number(process.env.AGENT_PORT || 4001);
app.listen(port, () => {
  console.log(`Agent service listening on http://localhost:${port}`);
  console.log(`Chat interface available at http://localhost:${port}/local.html`);
  console.log(`Salesforce health check: http://localhost:${port}/salesforce/health`);
});
