module.exports = {
  flowFile: "flows/flows.json",
  uiPort: process.env.PORT || 1880,
  httpAdminRoot: "/admin",
  httpNodeRoot: "/",
  functionGlobalContext: {}
};
