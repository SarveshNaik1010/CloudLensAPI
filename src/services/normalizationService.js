const CATEGORY_RULES = [
  ["Compute", /compute|ec2|virtual machine|virtualmachines|instance|vm/],
  ["Storage", /storage|s3|blob|bucket|disk/],
  ["Database", /database|rds|sql|cosmos|postgres|mysql/],
  ["Network", /network|vpc|load balancer|gateway|cdn|firewall/],
  ["Serverless", /lambda|function|serverless/],
  ["Container", /container|kubernetes|aks|eks|gke/],
  ["Analytics", /analytics|bigquery|synapse|redshift/],
  ["Security", /security|key vault|kms|secret/],
];
function categoryFor(type = "", service = "") {
  const value = `${type} ${service}`.toLowerCase();
  return CATEGORY_RULES.find(([, pattern]) => pattern.test(value))?.[0] || "Other";
}
function normalizeResource(resource, provider, connection = {}) {
  const resourceType = resource.resourceType || resource.type || "Unknown";
  return {
    resourceId: resource.resourceId ?? null,
    resourceName: resource.resourceName ?? resource.name ?? resource.resourceId ?? null,
    provider: String(provider).toUpperCase(),
    accountId: connection.provider_account_id ?? null,
    connectionId: connection.connection_id ?? null,
    resourceType,
    category: categoryFor(resourceType, resource.serviceName),
    region: resource.region ?? null,
    availabilityZone: resource.availabilityZone ?? null,
    status: resource.status ?? null,
    createdAt: resource.createdAt ?? resource.creationDate ?? resource.launchTime ?? null,
    cost: null,
    currency: null,
    utilization: null,
    tags: resource.tags ?? null,
    metadata: resource.metadata ?? null,
  };
}
function normalizeCost(record) {
  return {
    provider: record.provider ?? null,
    accountId: record.accountId ?? null,
    service: record.service ?? null,
    resourceId: record.resourceId ?? null,
    resourceName: record.resourceName ?? null,
    category: record.category || categoryFor(record.resourceType, record.service),
    region: record.region ?? null,
    periodStart: record.periodStart ?? null,
    periodEnd: record.periodEnd ?? null,
    cost: record.cost != null && Number.isFinite(Number(record.cost)) ? Number(record.cost) : null,
    currency: record.currency ?? null,
    usageAmount: record.usageAmount != null && Number.isFinite(Number(record.usageAmount)) ? Number(record.usageAmount) : null,
    usageUnit: record.usageUnit ?? null,
  };
}
module.exports = { categoryFor, normalizeResource, normalizeCost };
