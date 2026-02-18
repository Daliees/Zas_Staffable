# Quick Start Guide

## 🚀 Getting Started

### 1. Start Your Local Agent Service
```bash
npm start
```

Your service will start on `http://localhost:4001`

### 2. Test Locally (No Salesforce Needed)

#### Option A: Chat Interface
Open in browser: **http://localhost:4001/local.html**

✅ Modern, responsive chat interface
✅ Real-time agent responses
✅ No external dependencies

#### Option B: API Testing
```bash
curl -X POST http://localhost:4001/agent \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the PTO policy?"}'
```

---

## 🔗 Connect to Salesforce

### Step 1: Get Your Access Token

**Quick Method (if you have Salesforce CLI):**
```bash
# Authenticate with Salesforce
sfdx force:auth:web:login \
  --instanceurl https://tigristest-productie.my.salesforce.com \
  --clientid <YOUR_CLIENT_ID> \
  --clientsecret <YOUR_CLIENT_SECRET>

# Get the access token
sfdx force:org:display --verbose
```

**Manual Method:**
1. Visit: `https://tigristest-productie.my.salesforce.com/services/oauth2/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:4001/oauth/callback&response_type=code&scope=api%20refresh_token`
2. Authorize the app
3. Get the authorization code from the redirect URL
4. Exchange for access token (see SALESFORCE_SETUP.md for curl command)

### Step 2: Update Your .env File

Edit `.env` and update:
```env
SF_ACCESS_TOKEN=your_actual_access_token_here
```

### Step 3: Test Connection
```bash
npm run sf:integration
```

You should see:
```
✅ Connected to Salesforce
👤 User: your-email@example.com
```

---

## 📝 Usage Examples

### Local Chat (Running)
```
User: "What benefits do I get?"
Agent: "Benefits include health insurance, dental, vision, and 401k matching..."
```

### API: Process Message & Create Salesforce Task
```bash
curl -X POST http://localhost:4001/salesforce/process \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is the payroll schedule?",
    "recordType": "Task"
  }'
```

Response:
```json
{
  "agentResult": {
    "output": "Payroll runs bi-weekly on Fridays..."
  },
  "salesforceRecordId": "00T5X000003hhgUAA",
  "salesforceRecordUrl": "https://tigristest-productie.my.salesforce.com/..."
}
```

### Batch Process Pending Salesforce Tasks
```bash
curl -X POST http://localhost:4001/salesforce/process-pending \
  -H "Content-Type: application/json" \
  -d '{"recordType": "Task", "limit": 10}'
```

---

## 📊 What You Have Now

| Component | Status | Location |
|-----------|--------|----------|
| Local chat interface | ✅ Ready | `http://localhost:4001/local.html` |
| Agent API | ✅ Ready | `http://localhost:4001/agent` |
| Salesforce integration | 🔧 Needs token | See SALESFORCE_SETUP.md |
| FAQ knowledge base | ✅ Ready | `data/hr_faq.nl.json` |
| OpenAI integration | ✅ Ready | Configured in .env |

---

## 🔧 Common Tasks

### Check if service is running
```bash
curl http://localhost:4001/agent -d '{"message":"test"}' \
  -H "Content-Type: application/json"
```

### Check Salesforce connection (after token setup)
```bash
curl http://localhost:4001/salesforce/health
```

### View logs
```bash
tail -f /tmp/agent.log
```

### Restart service
```bash
pkill -f "node src/agent-service.js"
npm start
```

---

## 📚 Documentation

- **SALESFORCE_SETUP.md** - Detailed Salesforce setup instructions
- **ARCHITECTURE.md** - System design and data flow diagrams
- **package.json** - Available npm scripts

---

## 🐛 Troubleshooting

**Service won't start?**
```bash
npm install
npm start
```

**Chat interface not loading?**
- Make sure service is running: `npm start`
- Check port 4001 is not in use: `lsof -i :4001`

**Salesforce connection failing?**
- Check token is valid: `npm run sf:integration`
- See SALESFORCE_SETUP.md for token refresh instructions

**Agent not responding?**
- Check OpenAI API key in .env
- Verify internet connection
- Check logs: `tail -f /tmp/agent.log`

---

## 📞 Next Steps

1. ✅ Run local testing: `npm start` + open `http://localhost:4001/local.html`
2. 🔧 Get Salesforce access token (see SALESFORCE_SETUP.md)
3. 🔌 Update `.env` with token
4. ✅ Test Salesforce: `npm run sf:integration`
5. 🚀 Deploy or integrate with your systems

---

Happy testing! 🎉
