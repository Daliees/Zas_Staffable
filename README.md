# Staffable HR Agent

AI-powered WhatsApp HR assistant for [Staffable](https://staffable.com). Answers employee HR questions in Dutch, creates Salesforce tasks for action items, and routes messages through a Node-RED / FlowFuse flow.

---

## How it works

```
Employee (WhatsApp / Emulator)
        │
        ▼
POST /webhook/whatsapp
        │
        ▼
  AI Agent (LangChain + OpenAI)
  ┌─────────────────────────────┐
  │ 1. Check Dutch HR FAQ       │
  │ 2. Answer from HR knowledge │
  │ 3. Create Salesforce task   │
  │ 4. Reject off-topic msgs    │
  └─────────────────────────────┘
        │                    │
        ▼                    ▼
  Reply to employee    Forward to FlowFuse
                       (Salesforce task creation)
```

---

## Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in your keys:
#   OPENAI_API_KEY   — required for AI responses
#   NODERED_URL      — your FlowFuse webhook URL
#   SF_INSTANCE_URL  — Salesforce instance (optional)
#   SF_ACCESS_TOKEN  — Salesforce OAuth token (optional)
```

### 3. Start the agent

```bash
npm start
# Agent running at http://localhost:4001
# Chat emulator at  http://localhost:4001/local.html
```

### 4. (Optional) Expose publicly with ngrok

```bash
ngrok http 4001
# Copy the public URL into FlowFuse → Agent service HTTP Request node
```

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/webhook/whatsapp` | Main entry point — runs AI agent, returns reply |
| `POST` | `/agent` | Direct agent call (used by FlowFuse HTTP Request node) |
| `GET`  | `/health` | Liveness check |
| `GET`  | `/config` | Returns webhook URL and Node-RED target for UI |
| `GET`  | `/salesforce/health` | Salesforce connection check |
| `POST` | `/salesforce/process` | Process a message and create a Salesforce record |

---

## Agent behaviour

The agent always responds in formal Dutch (u/uw), or English if the question is in English.

| Input | Action | Example |
|-------|--------|---------|
| Question in FAQ | `answer_faq` | "Wanneer word ik uitbetaald?" |
| Generic HR question | `answer_faq` | "Hoeveel weken zwangerschapsverlof?" |
| Action required | `create_salesforce_task` | "Ik wil mijn IBAN wijzigen" |
| Off-topic | `no_action` | "Geef me een recept voor lasagne" |

---

## Project structure

```
src/
  agent.js            # LangChain + OpenAI agent, Zod schema, FAQ loader
  agent-service.js    # Express HTTP server
data/
  hr_faq.nl.json      # Dutch HR FAQ (17 entries from Staffable FAQ.txt)
web/
  index.html          # WhatsApp emulator with connection status badge
  local.html          # Lightweight local test UI
flows/
  flows.json          # Local Node-RED flow
  flows.flowfuse.json # Import-ready FlowFuse flow
scripts/
  tunnel.js           # localtunnel helper
  smoke.js            # End-to-end smoke test
  salesforce-test.js  # Salesforce connectivity test
docs/
  FAQ.txt             # Original Staffable HR FAQ source (Dutch)
```

---

## FlowFuse integration

1. Import `flows/flows.flowfuse.json` into your FlowFuse instance
2. Open the **Agent service** HTTP Request node
3. Set the URL to your ngrok / public tunnel URL + `/agent`
4. Deploy the flow

The flow routes messages: webhook → agent → switch on action → respond or create Salesforce task.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | ✅ | OpenAI API key |
| `OPENAI_MODEL` | — | Model to use (default: `gpt-4o-mini`) |
| `AGENT_PORT` | — | HTTP port (default: `4001`) |
| `NODERED_URL` | — | FlowFuse webhook URL for downstream processing |
| `FAQ_PATH` | — | Custom FAQ file path (default: `data/hr_faq.nl.json`) |
| `SF_INSTANCE_URL` | — | Salesforce instance URL |
| `SF_ACCESS_TOKEN` | — | Salesforce OAuth access token |
| `SF_API_VERSION` | — | Salesforce API version (default: `v60.0`) |

---

## Tech stack

- **Node.js 18+** / Express
- **LangChain** + **OpenAI** (`gpt-4o-mini`)
- **Zod** for structured output parsing
- **Node-RED** / **FlowFuse** for flow orchestration
- **Salesforce REST API** for task creation
- **ngrok** for public tunnel during development
