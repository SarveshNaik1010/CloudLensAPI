const test = require("node:test");
const assert = require("node:assert/strict");
const { categoryFor, normalizeResource, normalizeCost } = require("../src/services/normalizationService");

test("provider resource types map to common categories", () => {
  assert.equal(categoryFor("EC2"), "Compute");
  assert.equal(categoryFor("Microsoft.Storage/storageAccounts"), "Storage");
  assert.equal(categoryFor("Cloud SQL"), "Database");
  assert.equal(categoryFor("Cloud Functions"), "Serverless");
  assert.equal(categoryFor("unmapped service"), "Other");
});

test("resource normalization preserves provider identity and nullable fields", () => {
  const result = normalizeResource({ resourceId: "i-123", resourceType: "EC2", status: "running" }, "AWS", { provider_account_id: "123", connection_id: "c1" });
  assert.deepEqual({ id: result.resourceId, provider: result.provider, category: result.category, accountId: result.accountId, cost: result.cost, utilization: result.utilization }, { id: "i-123", provider: "AWS", category: "Compute", accountId: "123", cost: null, utilization: null });
  assert.equal(result.region, null);
});

test("cost normalization standardizes records and leaves unavailable amounts null", () => {
  assert.deepEqual(normalizeCost({ provider: "GCP", service: "Cloud SQL", cost: "4.25", currency: "USD" }), {
    provider: "GCP", accountId: null, service: "Cloud SQL", resourceId: null, resourceName: null,
    category: "Database", region: null, periodStart: null, periodEnd: null, cost: 4.25,
    currency: "USD", usageAmount: null, usageUnit: null,
  });
  assert.equal(normalizeCost({ cost: null }).cost, null);
});
