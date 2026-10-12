const connections = require("./cloudConnectionService");
const aws = require("./awsService");
const azure = require("./azureService");
const gcp = require("./gcpService");
const { normalizeResource } = require("./normalizationService");

const adapters = { AWS: aws, AZURE: azure, GCP: gcp };
async function allConnections(userId) {
  const rows = await connections.activeConnections(userId);
  const outcomes = await Promise.all(rows.map(async (connection) => {
    try {
      const resources = await adapters[connection.provider].resources(connection.credentials);
      return { connection, resources: resources.map((r) => normalizeResource(r, connection.provider, connection)), error: null };
    } catch (error) {
      return { connection, resources: [], error: { message: error.message || "Provider request failed" } };
    }
  }));
  return { outcomes, resources: outcomes.flatMap((x) => x.resources), errors: outcomes.filter((x) => x.error).map((x) => ({
    provider: x.connection.provider, connectionId: x.connection.connection_id,
    accountId: x.connection.provider_account_id, ...x.error,
  })) };
}
function filtered(resources, query) {
  const keys = ["provider", "accountId", "category", "resourceType", "region", "status"];
  return resources.filter((resource) => keys.every((key) => !query[key] || String(resource[key] ?? "").toLowerCase() === String(query[key]).toLowerCase()) &&
    (!query.tag || Object.entries(resource.tags || {}).some(([k, v]) => `${k}:${v}`.toLowerCase() === String(query.tag).toLowerCase() || String(v).toLowerCase() === String(query.tag).toLowerCase())));
}
function unavailable(metric, reason) { return { value: null, supported: false, reason }; }
async function resourcesPage(userId, query) {
  const { resources, errors } = await allConnections(userId);
  const result = filtered(resources, query);
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize, 10) || 25));
  return { items: result.slice((page - 1) * pageSize, page * pageSize), pagination: { page, pageSize, total: result.length, totalPages: Math.ceil(result.length / pageSize) }, providers: errors };
}
async function summary(userId) {
  const { resources, errors } = await allConnections(userId);
  return { totalMonthlyCost: unavailable("totalMonthlyCost", "Provider billing APIs are not integrated; existing pricing routes return partial estimates, not actual spend."), activeResources: { value: resources.length, supported: true }, potentialSavings: unavailable("potentialSavings", "No provider recommendation integrations are available."), forecastedCost: unavailable("forecastedCost", "No billing history or provider forecast integration is available."), currency: null, providers: errors };
}
async function categoryCosts(userId) {
  const categories = ["Compute", "Storage", "Network", "Database", "Serverless", "Container", "Analytics", "Security", "Other"];
  return { period: null, currency: null, total: null, supported: false, reason: "Normalized actual billing records are unavailable until provider billing APIs are integrated.", categories: categories.map((category) => ({ category, cost: null, percentage: null })), providers: [] };
}
async function comparison(userId) {
  return { aggregation: "month", from: null, to: null, currency: null, supported: false, reason: "Normalized actual billing time series are unavailable until provider billing APIs are integrated.", periods: [] };
}
async function filters(userId) {
  const { resources, errors } = await allConnections(userId);
  const values = (key) => [...new Set(resources.map((r) => r[key]).filter(Boolean))].sort();
  return { providers: values("provider"), accounts: values("accountId"), categories: [...new Set(resources.map((r) => r.category))].sort(), resourceTypes: values("resourceType"), regions: values("region"), statuses: values("status"), tagKeys: [...new Set(resources.flatMap((r) => Object.keys(r.tags || {})))].sort(), providerErrors: errors };
}
module.exports = { allConnections, resourcesPage, summary, categoryCosts, comparison, filters };
