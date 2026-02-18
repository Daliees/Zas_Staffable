const { runAgent } = require("../src/agent");

async function main() {
  const sample = "Can you schedule a follow up with the candidate next week?";
  const result = await runAgent(sample, { from: "+15551230000" });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
