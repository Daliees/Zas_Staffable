const test = require("node:test");
const assert = require("node:assert/strict");
const { runAgent, fallbackKeywordIntent } = require("../src/agent");

test("fallbackKeywordIntent returns FAQ response", () => {
  const result = fallbackKeywordIntent("What is the PTO policy?");
  assert.equal(result.action, "answer_faq");
  assert.ok(result.reply.includes("PTO"));
});

test("runAgent uses fallback without API key", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  const result = await runAgent("Please create a follow up task.");
  assert.equal(result.action, "create_salesforce_task");

  process.env.OPENAI_API_KEY = originalKey;
});
