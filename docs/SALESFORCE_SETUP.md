# Salesforce Integration Setup Guide

## Getting Your Salesforce Access Token

To connect your local agent with Salesforce test environment, you need a valid OAuth access token.

### Step 1: Create a Connected App in Salesforce

1. **Log into your Salesforce test environment** (tigristest-productie.my.salesforce.com)
2. Go to **Setup** → **Apps** → **App Manager**
3. Click **New Connected App**
4. Fill in the form:
   - **Connected App Name**: `HR Agent Local`
   - **API Name**: `HR_Agent_Local`
   - **Contact Email**: Your email
5. Under **API (Enable OAuth Settings)**:
   - ✅ Enable OAuth Settings
   - **Callback URL**: `http://localhost:4001/oauth/callback`
   - **Selected OAuth Scopes**: Add:
     - `api`
     - `refresh_token, offline_access`
6. Click **Save**

### Step 2: Get Your Client ID and Secret

After creating the Connected App:
1. Click **Manage** on the app
2. Click **Edit**
3. Copy the **Consumer Key** and **Consumer Secret**

### Step 3: Generate an Access Token (OAuth Flow)

Option A: Using Salesforce CLI (Recommended)
```bash
# Install Salesforce CLI: https://developer.salesforce.com/tools/sfdxcli

sfdx force:auth:web:login \
  --clientid YOUR_CONSUMER_KEY \
  --clientsecret YOUR_CONSUMER_SECRET \
  --instanceurl https://tigristest-productie.my.salesforce.com \
  --username your-salesforce-email@example.com

# Then get the access token
sfdx force:org:display --targetusername your-salesforce-email@example.com --verbose
```

Option B: Manual OAuth Flow
1. Visit this URL (replace with your Consumer Key):
```
https://tigristest-productie.my.salesforce.com/services/oauth2/authorize?
client_id=YOUR_CONSUMER_KEY&
redirect_uri=http://localhost:4001/oauth/callback&
response_type=code&
scope=api%20refresh_token
```

2. Authorize the app
3. You'll be redirected with an authorization code
4. Exchange it for an access token using curl:
```bash
curl -X POST https://tigristest-productie.my.salesforce.com/services/oauth2/token \
  -d "grant_type=authorization_code" \
  -d "client_id=YOUR_CONSUMER_KEY" \
  -d "client_secret=YOUR_CONSUMER_SECRET" \
  -d "redirect_uri=http://localhost:4001/oauth/callback" \
  -d "code=AUTHORIZATION_CODE"
```

The response will include `access_token`.

### Step 4: Update Your .env File

Replace the placeholder in your `.env`:

```env
SF_INSTANCE_URL=tigristest-productie.my.salesforce.com
SF_ACCESS_TOKEN=your_actual_access_token_here
SF_API_VERSION=v60.0
```

### Step 5: Test the Connection

Run the integration test:
```bash
npm run sf:integration
```

You should see:
```
✅ Connected to Salesforce
👤 User: your-email@example.com
🏢 Instance: tigristest-productie.my.salesforce.com
```

## How the Integration Works

Once connected, your local agent can:

### 1. **Process Messages and Create Tasks**
```bash
curl -X POST http://localhost:4001/salesforce/process \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is the PTO policy?",
    "recordType": "Task"
  }'
```

Response:
```json
{
  "agentResult": {
    "output": "The PTO policy allows 20 days per year...",
    "faqMatch": true
  },
  "salesforceRecordId": "00T5X000003hhgUAA",
  "salesforceRecordUrl": "https://tigristest-productie.my.salesforce.com/lightning/r/Task/00T5X000003hhgUAA/view"
}
```

### 2. **Process Pending Salesforce Tasks**
```bash
curl -X POST http://localhost:4001/salesforce/process-pending \
  -H "Content-Type: application/json" \
  -d '{"recordType": "Task", "limit": 10}'
```

This will:
- Find all open tasks in Salesforce
- Process them through your HR agent
- Update the tasks with the agent's response
- Create new Task records with the responses

### 3. **Check Salesforce Connection**
```bash
curl http://localhost:4001/salesforce/health
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/salesforce/health` | Check Salesforce connection |
| POST | `/salesforce/process` | Process a message and create Task |
| POST | `/salesforce/process-pending` | Process pending Salesforce records |
| POST | `/agent` | Legacy endpoint |
| GET | `/local.html` | Local chat interface |

## Request/Response Examples

### Process Message
**Request:**
```json
{
  "message": "What are the benefits?",
  "recordType": "Task",
  "from": "user@example.com"
}
```

**Response:**
```json
{
  "agentResult": {
    "output": "Benefits include...",
    "faqMatch": true,
    "confidence": 0.95
  },
  "salesforceRecordId": "00T5X000003hhgUAA",
  "salesforceRecordUrl": "https://tigristest-productie.my.salesforce.com/lightning/r/Task/00T5X000003hhgUAA/view"
}
```

## Troubleshooting

**Bad_OAuth_Token Error:**
- Your access token has expired or is invalid
- Get a new token and update `.env`

**INVALID_CROSS_REFERENCE_KEY:**
- The record type doesn't exist in your Salesforce instance
- Use `Task` or `Case` (these are standard objects)

**REQUIRED_FIELD_MISSING:**
- Add required fields in `salesforce-integration.js` processMessageAndCreateRecord function

## Next Steps

1. ✅ Get your Salesforce access token
2. ✅ Update `.env` file
3. ✅ Run `npm run sf:integration` to test
4. ✅ Create a webhook in Salesforce to call your `/salesforce/process` endpoint
5. ✅ Monitor agent responses in Salesforce

