const test = require("node:test");
const assert = require("node:assert/strict");
process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY ||= "test-secret";
const Module = require("node:module");
const paths = {
  connections: require.resolve("../src/services/cloudConnectionService"),
  aws: require.resolve("../src/services/awsService"),
  azure: require.resolve("../src/services/azureService"),
  gcp: require.resolve("../src/services/gcpService"),
};
const previous = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, require.cache[path]]));
const connections = { activeConnections: async () => [] };
const aws = { resources: async () => [] };
for (const [key, path] of Object.entries(paths)) {
  const exports = key === "connections" ? connections : key === "aws" ? aws : key === "gcp" ? { resources: async () => { throw new Error("unavailable"); } } : { resources: async () => [] };
  require.cache[path] = { id: path, filename: path, loaded: true, exports };
}
const dashboard = require("../src/services/dashboardService");

test("resource endpoint filters, paginates, and reports partial provider failures", async (t) => {
  t.after(() => {
    for (const [key, path] of Object.entries(paths)) {
      if (previous[key]) require.cache[path] = previous[key];
      else delete require.cache[path];
    }
  });
  connections.activeConnections = async () => [
    { provider: "AWS", connection_id: "a", provider_account_id: "1", credentials: {} },
    { provider: "GCP", connection_id: "g", provider_account_id: "2", credentials: {} },
  ];
  aws.resources = async () => [
    { resourceId: "i-1", resourceName: "one", resourceType: "EC2", region: "west", status: "running" },
    { resourceId: "i-2", resourceName: "two", resourceType: "EC2", region: "west", status: "running" },
  ];
  const result = await dashboard.resourcesPage("u", { provider: "AWS", category: "Compute", page: "2", pageSize: "1" });
  assert.equal(result.pagination.total, 2);
  assert.equal(result.items[0].resourceId, "i-2");
  assert.equal(result.providers.length, 1);
  assert.equal(result.providers[0].provider, "GCP");
});
