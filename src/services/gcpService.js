const { createGcpClients } = require("../config/gcp");

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}
async function vms(credentials) {
  const { compute } = createGcpClients(credentials);
  const result = await compute.instances.aggregatedList({
    project: credentials.projectId,
    maxResults: 500,
  });
  return Object.values(result.data.items || {})
    .flatMap((zone) => zone.instances || [])
    .map((vm) => ({
      instanceId: vm.id,
      instanceName: vm.name,
      machineType: vm.machineType?.split("/").pop(),
      state: vm.status?.toLowerCase(),
      zone: vm.zone?.split("/").pop(),
      region: vm.zone?.split("/").pop().replace(/-[a-z]$/, ""),
    }));
}
async function storage(credentials) {
  const { storage: client } = createGcpClients(credentials);
  const result = await client.buckets.list({
    project: credentials.projectId,
    maxResults: 500,
  });
  return (result.data.items || []).map((bucket) => ({
    bucketName: bucket.name,
    location: bucket.location,
    storageClass: bucket.storageClass,
    creationDate: bucket.timeCreated,
    status: bucket.iamConfiguration?.uniformBucketLevelAccess?.enabled
      ? "uniform-access"
      : "available",
  }));
}
async function databases(credentials) {
  const { sql } = createGcpClients(credentials);
  const result = await sql.instances.list({ project: credentials.projectId });
  return (result.data.items || []).map((db) => ({
    instanceName: db.name,
    databaseVersion: db.databaseVersion,
    region: db.region,
    tier: db.settings?.tier,
    status: db.state?.toLowerCase(),
  }));
}
async function resources(credentials) {
  const [instances, buckets, dbs] = await Promise.all([
    vms(credentials),
    storage(credentials),
    databases(credentials),
  ]);
  return [
    ...instances.map((x) => ({
      resourceId: x.instanceId,
      resourceName: x.instanceName,
      provider: "GCP",
      resourceType: "Compute Engine",
      region: x.region,
      status: x.state,
    })),
    ...buckets.map((x) => ({
      resourceId: x.bucketName,
      resourceName: x.bucketName,
      provider: "GCP",
      resourceType: "Cloud Storage",
      region: x.location,
      status: x.status,
    })),
    ...dbs.map((x) => ({
      resourceId: x.instanceName,
      resourceName: x.instanceName,
      provider: "GCP",
      resourceType: "Cloud SQL",
      region: x.region,
      status: x.status,
    })),
  ];
}
function resourceName(projectId, type, id) {
  return `projects/${projectId}/${type}/${id}`;
}
async function timeSeries(credentials, filter) {
  const { monitoring } = createGcpClients(credentials);
  const result = await monitoring.projects.timeSeries.list({
    name: `projects/${credentials.projectId}`,
    filter,
    "interval.startTime": new Date(Date.now() - 3600000).toISOString(),
    "interval.endTime": new Date().toISOString(),
    view: "FULL",
    pageSize: 100,
  });
  return result.data.timeSeries || [];
}
function latest(series) {
  const points = series
    .flatMap((s) => s.points || [])
    .sort(
      (a, b) =>
        Date.parse(b.interval?.endTime || 0) -
        Date.parse(a.interval?.endTime || 0),
    );
  return Number(
    points[0]?.value?.doubleValue ?? points[0]?.value?.int64Value ?? 0,
  );
}
async function vmMetrics(credentials, instanceId) {
  const metrics = [
    ["cpuUtilization", "compute.googleapis.com/instance/cpu/utilization"],
    [
      "networkIn",
      "compute.googleapis.com/instance/network/received_bytes_count",
    ],
    ["networkOut", "compute.googleapis.com/instance/network/sent_bytes_count"],
    ["diskReadOps", "compute.googleapis.com/instance/disk/read_ops_count"],
    ["diskWriteOps", "compute.googleapis.com/instance/disk/write_ops_count"],
  ];
  const values = await Promise.all(
    metrics.map(async ([key, metric]) => [
      key,
      latest(
        await timeSeries(
          credentials,
          `metric.type="${metric}" AND resource.labels.instance_id="${instanceId}"`,
        ),
      ),
    ]),
  );
  return { instanceId, ...Object.fromEntries(values) };
}
async function genericMetrics(credentials, resourceType, label, id, names) {
  const values = await Promise.all(
    names.map(async ([key, metric]) => [
      key,
      latest(
        await timeSeries(
          credentials,
          `metric.type="${metric}" AND resource.type="${resourceType}" AND resource.labels.${label}="${id}"`,
        ),
      ),
    ]),
  );
  return Object.fromEntries(values);
}
async function storageMetrics(credentials, bucketName) {
  return {
    bucketName,
    ...(await genericMetrics(
      credentials,
      "gcs_bucket",
      "bucket_name",
      bucketName,
      [
        ["storageBytes", "storage.googleapis.com/storage/total_bytes"],
        ["objectCount", "storage.googleapis.com/storage/object_count"],
        ["ingressBytes", "storage.googleapis.com/network/received_bytes_count"],
        ["egressBytes", "storage.googleapis.com/network/sent_bytes_count"],
      ],
    )),
  };
}
async function databaseMetrics(credentials, instanceName) {
  return {
    instanceName,
    ...(await genericMetrics(
      credentials,
      "cloudsql_database",
      "database_id",
      `${credentials.projectId}:${instanceName}`,
      [
        ["cpuUtilization", "cloudsql.googleapis.com/database/cpu/utilization"],
        [
          "memoryUtilization",
          "cloudsql.googleapis.com/database/memory/utilization",
        ],
        ["storageBytes", "cloudsql.googleapis.com/database/disk/bytes_used"],
        ["connections", "cloudsql.googleapis.com/database/network/connections"],
      ],
    )),
  };
}
async function vmDetail(credentials, instanceId) {
  const vm = (await vms(credentials)).find(
    (item) =>
      String(item.instanceId) === String(instanceId) ||
      item.instanceName === instanceId,
  );
  if (!vm) throw notFound("Compute Engine instance not found");
  const { compute } = createGcpClients(credentials);
  const result = await compute.instances.get({
    project: credentials.projectId,
    zone: vm.zone,
    instance: vm.instanceName,
  });
  const data = result.data;
  return {
    ...vm,
    machineType: data.machineType?.split("/").pop(),
    creationTimestamp: data.creationTimestamp,
    hostname: data.hostname,
    networkInterfaces: (data.networkInterfaces || []).map((n) => ({
      network: n.network,
      networkIP: n.networkIP,
      accessConfigs: n.accessConfigs,
    })),
    disks: (data.disks || []).map((d) => ({
      source: d.source,
      boot: d.boot,
      mode: d.mode,
    })),
    labels: data.labels || {},
  };
}
async function storageDetail(credentials, bucketName) {
  const { storage: client } = createGcpClients(credentials);
  let result;
  try {
    result = await client.buckets.get({ bucket: bucketName });
  } catch (error) {
    if (error.code === 404) throw notFound("Cloud Storage bucket not found");
    throw error;
  }
  const b = result.data;
  return {
    bucketName: b.name,
    location: b.location,
    storageClass: b.storageClass,
    creationDate: b.timeCreated,
    versioning: b.versioning?.enabled || false,
    uniformBucketLevelAccess:
      b.iamConfiguration?.uniformBucketLevelAccess?.enabled || false,
    publicAccessPrevention: b.iamConfiguration?.publicAccessPrevention,
  };
}
async function databaseDetail(credentials, instanceName) {
  const { sql } = createGcpClients(credentials);
  let result;
  try {
    result = await sql.instances.get({
      project: credentials.projectId,
      instance: instanceName,
    });
  } catch (error) {
    if (error.code === 404) throw notFound("Cloud SQL instance not found");
    throw error;
  }
  const db = result.data;
  return {
    instanceName: db.name,
    databaseVersion: db.databaseVersion,
    region: db.region,
    tier: db.settings?.tier,
    state: db.state,
    ipAddresses: db.ipAddresses || [],
    settings: db.settings,
    createTime: db.createTime,
    connectionName: db.connectionName,
  };
}
function monthly(hourlyPrice) {
  return Number((hourlyPrice * 24 * 30).toFixed(2));
}
async function skuPrice(
  credentials,
  match,
  region,
  servicePattern = "Compute Engine",
) {
  const { billing } = createGcpClients(credentials);
  const services = await billing.services.list({ pageSize: 100 });
  const service = (services.data.services || []).find((s) =>
    new RegExp(servicePattern, "i").test(s.displayName || ""),
  );
  if (!service) return 0;
  const result = await billing.services.skus.list({
    parent: service.name,
    pageSize: 5000,
  });
  const sku = (result.data.skus || []).find(
    (s) =>
      (s.description || "").toLowerCase().includes(match.toLowerCase()) &&
      (!region || s.serviceRegions?.includes(region)) &&
      s.pricingInfo?.length,
  );
  const rate =
    sku?.pricingInfo?.[0]?.pricingExpression?.tieredRates?.[0]?.unitPrice;
  return Number(rate?.units || 0) + Number(rate?.nanos || 0) / 1e9;
}
async function vmPricing(credentials) {
  return Promise.all(
    (await vms(credentials)).map(async (vm) => {
      const hourlyPrice = await skuPrice(
        credentials,
        vm.machineType,
        vm.region,
      );
      return {
        instanceId: vm.instanceId,
        instanceType: vm.machineType,
        hourlyPrice,
        estimatedMonthlyCost: monthly(hourlyPrice),
        currency: "USD",
        note: "Estimate excludes sustained-use discounts, licensing, and attached disks.",
      };
    }),
  );
}
async function storagePricing(credentials) {
  return Promise.all(
    (await storage(credentials)).map(async (bucket) => {
      const usage = await storageMetrics(credentials, bucket.bucketName);
      const storageGB = Number((usage.storageBytes / 1024 ** 3).toFixed(4));
      const pricePerGBMonth = await skuPrice(
        credentials,
        `${bucket.storageClass || "STANDARD"} storage`,
        bucket.location,
        "Cloud Storage",
      );
      return {
        bucketName: bucket.bucketName,
        storageGB,
        pricePerGBMonth,
        estimatedMonthlyCost: Number((storageGB * pricePerGBMonth).toFixed(4)),
        currency: "USD",
        note: "Estimate excludes operations, retrieval, and network egress.",
      };
    }),
  );
}
async function databasePricing(credentials) {
  return Promise.all(
    (await databases(credentials)).map(async (db) => {
      const hourlyPrice = db.tier
        ? await skuPrice(credentials, db.tier, db.region, "Cloud SQL")
        : 0;
      return {
        instanceName: db.instanceName,
        tier: db.tier,
        hourlyPrice,
        estimatedMonthlyCost: monthly(hourlyPrice),
        currency: "USD",
        note: "Estimate excludes storage, backups, networking, and licensing.",
      };
    }),
  );
}
async function dashboard(credentials) {
  const [instances, buckets, dbs, prices] = await Promise.all([
    vms(credentials),
    storage(credentials),
    databases(credentials),
    vmPricing(credentials),
  ]);
  return {
    totalResources: instances.length + buckets.length + dbs.length,
    totalVMs: instances.length,
    totalStorageBuckets: buckets.length,
    totalDatabases: dbs.length,
    estimatedMonthlyCost: Number(
      prices.reduce((sum, x) => sum + x.estimatedMonthlyCost, 0).toFixed(2),
    ),
  };
}
module.exports = {
  vms,
  storage,
  databases,
  resources,
  vmDetail,
  storageDetail,
  databaseDetail,
  vmMetrics,
  storageMetrics,
  databaseMetrics,
  vmPricing,
  storagePricing,
  databasePricing,
  dashboard,
};
