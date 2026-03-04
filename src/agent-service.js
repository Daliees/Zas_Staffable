const express = require("express");
const { config } = require("dotenv");
const path = require("path");
const { runAgent } = require("./agent");
const { saveMessage, getHistory, clearHistory, getStats, getUsers } = require("./db");
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
// 1. Loads conversation history for this phone number from SQLite.
// 2. Calls the local AI agent with full context.
// 3. Saves both the user message and agent reply to SQLite.
// 4. Optionally forwards the agent result to FlowFuse/Node-RED.
app.post("/webhook/whatsapp", async (req, res) => {
  try {
    const message = req.body?.Body || req.body?.text || "";
    const from = req.body?.From || req.body?.from || "";
    console.log("/webhook/whatsapp incoming", { from, text: message.slice(0, 200) });

    // ── Step 1: Load conversation history from SQLite ─────────────
    const HISTORY_TURNS = Number(process.env.HISTORY_TURNS || 10);
    const history = from ? getHistory(from, HISTORY_TURNS) : [];
    console.log(`/webhook/whatsapp history for ${from}: ${history.length} turns`);

    // ── Step 2: Run the AI agent with context ─────────────────────
    const agentResult = await runAgent(message, { from }, history);
    console.log("/webhook/whatsapp agent result", agentResult);

    // ── Step 3: Persist both turns to SQLite ──────────────────────
    if (from) {
      saveMessage({ phone: from, role: "user",      message });
      saveMessage({ phone: from, role: "assistant", message: agentResult.reply || "", action: agentResult.action });
    }

    // ── Step 4: Forward agent result to FlowFuse (fire-and-forget) ─
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

    // ── Step 5: Build a human-friendly reply ─────────────────────
    let reply = agentResult.reply;
    if (!reply || reply.trim() === "") {
      if (agentResult.action === "create_salesforce_task") {
        const t = agentResult.task || {};
        reply = `Begrepen — ik heb een Salesforce-taak aangemaakt: "${t.subject || "Follow-up"}" (prioriteit: ${t.priority || "Normal"}).`;
        if (t.dueDate) reply += ` Deadline: ${t.dueDate}.`;
      } else {
        reply = "Ik weet het niet zeker. Kunt u uw vraag anders formuleren?";
      }
    }

    // ── Step 6: Return the AI reply immediately ───────────────────
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
      reply: "Sorry, er is een fout opgetreden. Probeer het opnieuw."
    });
  }
});

// Legacy endpoint for backward compatibility (also passes history)
app.post("/agent", async (req, res) => {
  try {
    const message = req.body?.text || req.body?.message || "";
    const from = req.body?.from || req.body?.From || "";
    console.log("/agent request", { from, message: message.slice(0, 200) });

    const history = from ? getHistory(from, Number(process.env.HISTORY_TURNS || 10)) : [];
    const result = await runAgent(message, { from }, history);

    // NOTE: do NOT save here — /webhook/whatsapp already saved both turns
    // before forwarding to FlowFuse. Saving here would cause duplicates.

    res.json({ ...result, from });
  } catch (error) {
    res.status(500).json({
      error: "AgentError",
      message: error.message
    });
  }
});

// ==================== CONVERSATION HISTORY ====================

// GET /conversation/users  — list all users with message counts
app.get("/conversation/users", (_req, res) => {
  res.json({ users: getUsers() });
});

// GET /conversation/history?phone=+31612345678  — last N messages
app.get("/conversation/history", (req, res) => {
  const phone = req.query.phone;
  if (!phone) return res.status(400).json({ error: "Missing ?phone= query param" });
  const limit = Number(req.query.limit || 20);
  const history = getHistory(phone, limit);
  res.json({ phone, count: history.length, messages: history });
});

// DELETE /conversation/reset?phone=+31612345678  — wipe history for a number
app.delete("/conversation/reset", (req, res) => {
  const phone = req.query.phone;
  if (!phone) return res.status(400).json({ error: "Missing ?phone= query param" });
  clearHistory(phone);
  res.json({ ok: true, message: `Conversation history cleared for ${phone}` });
});

// GET /conversation/stats  — aggregate counts across all users
app.get("/conversation/stats", (_req, res) => {
  res.json(getStats());
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
  console.log(`Chat emulator available at http://localhost:${port}/local.html`);
  console.log(`Admin dashboard    at http://localhost:${port}/admin.html`);
  console.log(`Salesforce health  at http://localhost:${port}/salesforce/health`);
});
