# Integration Architecture

## System Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     YOUR LOCAL SETUP                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Agent Service (Port 4001)                  │  │
│  │                                                          │  │
│  │  ┌────────────────────────────────────────────────────┐ │  │
│  │  │           Express.js Application                  │ │  │
│  │  │                                                    │ │  │
│  │  │  • /agent                    (Legacy)             │ │  │
│  │  │  • /webhook/whatsapp         (WhatsApp mode)      │ │  │
│  │  │  • /local.html               (Local chat UI)      │ │  │
│  │  │  • /salesforce/health        (Connection check)   │ │  │
│  │  │  • /salesforce/process       (Process message)    │ │  │
│  │  │  • /salesforce/process-pending (Batch process)    │ │  │
│  │  └────────────────────────────────────────────────────┘ │  │
│  │                         │                                │  │
│  │                         ▼                                │  │
│  │  ┌────────────────────────────────────────────────────┐ │  │
│  │  │          runAgent() - LangChain Agent             │ │  │
│  │  │                                                    │ │  │
│  │  │  • Processes natural language questions           │ │  │
│  │  │  • Searches FAQ database                          │ │  │
│  │  │  • Uses OpenAI for complex queries                │ │  │
│  │  │  • Returns structured responses                   │ │  │
│  │  └────────────────────────────────────────────────────┘ │  │
│  │                         │                                │  │
│  │                         └──────────────────────────┐     │  │
│  └────────────────────────────────────────────────────┼─────┘  │
│                                                        │        │
│  ┌────────────────────────────────────────────────────┼──────┐ │
│  │    Salesforce Integration Module                   │      │ │
│  │                                                    │      │ │
│  │  • OAuth Authentication                           │      │ │
│  │  • SOQL Queries (Search Salesforce records)       │      │ │
│  │  • Create/Update Tasks and Cases                  │      │ │
│  │  • Return Salesforce record URLs                  │      │ │
│  │                                                    │      │ │
│  └────────────────────────────────────────────────────┼──────┘ │
│                                                        │        │
└────────────────────────────────────────────────────────┼────────┘
                                                         │
                                                         │ HTTPS
                                                         │
                                ┌────────────────────────▼─────────┐
                                │   SALESFORCE TEST ENVIRONMENT    │
                                │                                  │
                                │  tigristest-productie.my.        │
                                │  salesforce.com                  │
                                │                                  │
                                │  • Users & Contacts              │
                                │  • Cases & Tasks                 │
                                │  • Custom Objects                │
                                │  • Records & Metadata            │
                                │                                  │
                                └──────────────────────────────────┘
```

## Data Flow Diagram

### Scenario 1: Local Chat Interface

```
Browser (localhost:4001/local.html)
        │
        │ User types: "What's the PTO policy?"
        │
        ▼
POST /agent
        │
        ├─ Message: "What's the PTO policy?"
        ├─ From: "local-user"
        │
        ▼
runAgent()
        │
        ├─ Search FAQ: ✓ Found match
        ├─ Response: "PTO allows 20 days per year..."
        │
        ▼
Response returned
        │
        ├─ output: "PTO allows 20 days per year..."
        │
        ▼
Display in chat bubble
```

### Scenario 2: Salesforce Integration

```
Salesforce Task Created
        │
        │ Task Subject: "What benefits do I get?"
        │
        ▼
External system calls: POST /salesforce/process
        │
        ├─ message: "What benefits do I get?"
        ├─ recordType: "Task"
        │
        ▼
runAgent()
        │
        ├─ Search FAQ: ✓ Found match
        ├─ Response: "Benefits include health insurance..."
        │
        ▼
OAuth request to Salesforce
        │
        ├─ Authorization: Bearer {access_token}
        │
        ▼
Create new Task in Salesforce
        │
        ├─ Subject: "HR Agent Response"
        ├─ Description: "Query: What benefits do I get?..."
        ├─ Status: "Completed"
        │
        ▼
Return response
        │
        ├─ agentResult: { output: "Benefits include..." }
        ├─ salesforceRecordId: "00T5X000003hhgUAA"
        ├─ salesforceRecordUrl: "https://tigristest-productie..."
        │
        ▼
Record visible in Salesforce
```

### Scenario 3: Batch Processing Pending Tasks

```
curl -X POST /salesforce/process-pending
        │
        │ recordType: "Task"
        │ limit: 10
        │
        ▼
OAuth to Salesforce
        │
        ├─ Query: SELECT * FROM Task WHERE Status = 'Open'
        │
        ▼
Found 5 pending tasks
        │
        ├─ Task 1: "What is payroll schedule?"
        ├─ Task 2: "How do I request PTO?"
        ├─ Task 3: "Tell me about dental benefits"
        ├─ Task 4: "New hire onboarding steps?"
        ├─ Task 5: "How do I change benefits?"
        │
        ▼
For each task:
        │
        ├─ runAgent(task_description)
        ├─ Create response Task in Salesforce
        ├─ Update original Task to "Completed"
        │
        ▼
Return summary
        │
        ├─ processed: 5
        ├─ records: [
        │    { recordId, message, response, salesforceRecordId }
        │  ]
        │
        ▼
All done!
```

## Database & File Structure

```
/Users/dalil/Code/Staffable_agent/
│
├── src/
│   ├── agent.js                      # Main LangChain agent logic
│   ├── agent-service.js              # Express server & API endpoints
│   └── salesforce-integration.js     # NEW: Salesforce auth & API calls
│
├── web/
│   ├── index.html                    # WhatsApp-style chat interface
│   └── local.html                    # NEW: Local testing chat interface
│
├── scripts/
│   ├── salesforce-test.js            # Original Salesforce test
│   └── test-salesforce-integration.js # NEW: Integration test suite
│
├── data/
│   └── hr_faq.nl.json               # FAQ knowledge base
│
├── docs/
│   ├── SALESFORCE_SETUP.md          # NEW: Setup instructions
│   └── ARCHITECTURE.md              # This file
│
└── .env
    ├── OPENAI_API_KEY
    ├── OPENAI_MODEL
    ├── AGENT_PORT
    ├── SF_INSTANCE_URL               # Your Salesforce instance
    ├── SF_ACCESS_TOKEN               # OAuth token (needs update)
    └── SF_API_VERSION
```

## Configuration & Environment

### Required Environment Variables

```env
# OpenAI Configuration
OPENAI_API_KEY=sk-proj-...          # Your OpenAI API key
OPENAI_MODEL=gpt-4o-mini            # Model to use

# Agent Service
AGENT_PORT=4001                      # Local server port

# Salesforce Configuration
SF_INSTANCE_URL=tigristest-productie.my.salesforce.com
SF_ACCESS_TOKEN=<YOUR_OAUTH_TOKEN>  # Must be updated!
SF_API_VERSION=v60.0                 # Salesforce API version
```

## API Reference

### Health Check
```
GET /salesforce/health

Response:
{
  "ok": true,
  "connectedAs": "email@example.com",
  "orgId": "00D...",
  "instanceUrl": "tigristest-productie.my.salesforce.com"
}
```

### Process Single Message
```
POST /salesforce/process

{
  "message": "What is the PTO policy?",
  "recordType": "Task",
  "from": "optional-user-id"
}

Response:
{
  "agentResult": {
    "output": "...",
    "faqMatch": boolean,
    "confidence": number
  },
  "salesforceRecordId": "00T5X000003hhgUAA",
  "salesforceRecordUrl": "https://..."
}
```

### Process Pending Records
```
POST /salesforce/process-pending

{
  "recordType": "Task",
  "limit": 10
}

Response:
{
  "processed": 5,
  "records": [
    {
      "recordId": "...",
      "message": "What is payroll schedule?",
      "response": { ... },
      "salesforceRecordId": "..."
    }
  ]
}
```

## Security Considerations

⚠️ **Important Security Notes:**

1. **Never commit .env file** - Use `.gitignore` to exclude it
2. **Access tokens expire** - Implement refresh token flow for production
3. **Rate limiting** - Salesforce has API rate limits (typically 15 min per 24hrs for most editions)
4. **Field permissions** - Ensure the Salesforce user has permission to create Tasks/Cases
5. **Audit logging** - Log all Salesforce operations for compliance
6. **Test environment only** - This is configured for test org (`tigristest-productie`)

## Troubleshooting

### Connection Issues
- ❌ `Bad_OAuth_Token` → Get fresh access token
- ❌ `INVALID_CROSS_REFERENCE_KEY` → Use standard objects (Task, Case)
- ❌ `REQUIRED_FIELD_MISSING` → Check required fields in Salesforce

### Performance Issues
- Consider caching FAQ results
- Implement pagination for large record sets
- Use Salesforce bulk APIs for batch operations

### Testing
```bash
# Test local chat (no Salesforce needed)
npm start
# Then visit: http://localhost:4001/local.html

# Test Salesforce connection (requires valid token)
npm run sf:integration

# Test original Salesforce script
npm run sf:test
```

