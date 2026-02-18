const localtunnel = require("localtunnel");

const port = Number(process.env.AGENT_PORT || 4001);
const host = process.env.TUNNEL_HOST || "https://loca.lt";
const subdomain = process.env.TUNNEL_SUBDOMAIN || undefined;

const startTunnel = async () => {
  try {
    const tunnel = await localtunnel({
      port,
      host,
      subdomain,
      local_host: "127.0.0.1"
    });

    console.log(`Tunnel URL: ${tunnel.url}`);

    tunnel.on("close", () => {
      console.log("Tunnel closed");
      process.exit(0);
    });
  } catch (error) {
    console.error("Failed to start tunnel:", error.message);
    process.exit(1);
  }
};

startTunnel();