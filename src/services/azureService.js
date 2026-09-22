const { createAzureClients } = require('../config/azure');

const VM_TYPE = 'microsoft.compute/virtualmachines';
const STORAGE_TYPE = 'microsoft.storage/storageaccounts';
const DATABASE_TYPES = [
  'microsoft.sql/servers/databases',
  'microsoft.dbforpostgresql/servers', 'microsoft.dbforpostgresql/flexibleservers',
  'microsoft.dbformysql/servers', 'microsoft.dbformysql/flexibleservers',
];

function resourceGroup(resourceId) {
  return resourceId.match(/\/resourceGroups\/([^/]+)/i)?.[1];
}
function engine(type) {
  if (type.includes('postgresql')) return 'PostgreSQL';
  if (type.includes('mysql')) return 'MySQL';
  return 'Azure SQL';
}
async function graph(credentials, query) {
  const { resourceGraph } = createAzureClients(credentials);
  const result = await resourceGraph.resources({ subscriptions: [credentials.subscriptionId], query });
  return result.data || [];
}
async function vms(credentials) {
  const { compute } = createAzureClients(credentials);
  const inventory = [];
  for await (const vm of compute.virtualMachines.listAll()) {
    let powerState = 'unknown';
    try {
      const view = await compute.virtualMachines.instanceView(resourceGroup(vm.id), vm.name);
      powerState = view.statuses?.find((status) => status.code?.startsWith('PowerState/'))?.displayStatus?.replace(/^VM /, '').toLowerCase() || powerState;
    } catch (_) { /* Reader permissions may not include instance view; still return inventory. */ }
    inventory.push({ instanceId: vm.id, instanceName: vm.name, vmSize: vm.hardwareProfile?.vmSize, powerState, region: vm.location });
  }
  return inventory;
}
async function storage(credentials) {
  const records = await graph(credentials, `Resources | where type =~ '${STORAGE_TYPE}' | project id, name, location, sku, kind, properties`);
  return records.map((item) => ({ resourceId: item.id, storageAccountName: item.name, location: item.location, sku: item.sku?.name, kind: item.kind, status: item.properties?.provisioningState }));
}
async function databases(credentials) {
  const types = DATABASE_TYPES.map((type) => `'${type}'`).join(', ');
  const records = await graph(credentials, `Resources | where type in~ (${types}) | project id, name, type, location, sku, properties`);
  return records.map((item) => ({ resourceId: item.id, databaseName: item.name, engine: engine(item.type), location: item.location, sku: item.sku?.name, status: item.properties?.state || item.properties?.userVisibleState || 'unknown' }));
}
async function resources(credentials) {
  const records = await graph(credentials, "Resources | project id, name, type, location, properties");
  return records.map((item) => ({
    resourceId: item.id, resourceName: item.name, provider: 'AZURE',
    resourceType: item.type.split('/').pop(), region: item.location,
    status: item.properties?.provisioningState || item.properties?.powerState || 'available',
  }));
}
function latestMetric(result, name) {
  const metric = result.metrics?.find((item) => item.name === name);
  const points = metric?.timeSeries?.flatMap((series) => series.data || []) || [];
  const point = points.at(-1) || {};
  return point.average ?? point.total ?? 0;
}
async function vmMetrics(credentials, resourceId) {
  const { metrics } = createAzureClients(credentials);
  const result = await metrics.queryResource(resourceId, ['Percentage CPU', 'Network In Total', 'Network Out Total', 'Disk Read Operations/Sec', 'Disk Write Operations/Sec'], { aggregations: ['Average', 'Total'], granularity: 'PT1H', timespan: { startTime: new Date(Date.now() - 3600000), endTime: new Date() } });
  return { resourceId, cpuUtilization: latestMetric(result, 'Percentage CPU'), networkIn: latestMetric(result, 'Network In Total'), networkOut: latestMetric(result, 'Network Out Total'), diskReadOps: latestMetric(result, 'Disk Read Operations/Sec'), diskWriteOps: latestMetric(result, 'Disk Write Operations/Sec') };
}
async function resourceMetrics(credentials, resourceId, metricNames) {
  const { metrics } = createAzureClients(credentials);
  const result = await metrics.queryResource(resourceId, metricNames, { aggregations: ['Average', 'Total'], granularity: 'PT1H', timespan: { startTime: new Date(Date.now() - 3600000), endTime: new Date() } });
  return Object.fromEntries(metricNames.map((name) => [name, latestMetric(result, name)]));
}
async function vmDetail(credentials, resourceId) {
  const records = await graph(credentials, `Resources | where id =~ '${resourceId.replace(/'/g, "''")}' | project id, name, location, sku, properties, tags`);
  const vm = records[0]; if (!vm) { const error = new Error('Virtual machine not found'); error.status = 404; throw error; }
  return { resourceId: vm.id, instanceName: vm.name, vmSize: vm.properties?.hardwareProfile?.vmSize || vm.sku?.name, region: vm.location, provisioningState: vm.properties?.provisioningState, osType: vm.properties?.storageProfile?.osDisk?.osType, tags: vm.tags || {} };
}
async function storageMetrics(credentials, resourceId) { return { resourceId, ...(await resourceMetrics(credentials, resourceId, ['UsedCapacity', 'Transactions', 'Ingress', 'Egress'])) }; }
async function databaseMetrics(credentials, resourceId) { return { resourceId, ...(await resourceMetrics(credentials, resourceId, ['cpu_percent', 'connections_failed', 'storage_percent', 'dtu_consumption_percent'])) }; }
async function hourlyPrice(vm) {
  if (!vm.vmSize || !vm.region) return 0;
  const filter = `serviceName eq 'Virtual Machines' and armRegionName eq '${vm.region}' and armSkuName eq '${vm.vmSize}' and priceType eq 'Consumption'`;
  const response = await fetch(`https://prices.azure.com/api/retail/prices?${new URLSearchParams({ '$filter': filter })}`);
  if (!response.ok) throw new Error(`Azure Retail Prices API returned ${response.status}`);
  const body = await response.json();
  const item = body.Items?.find((price) => price.currencyCode === 'USD' && price.unitOfMeasure?.toLowerCase().includes('hour'));
  return Number(item?.retailPrice || 0);
}
async function vmPricing(credentials) {
  const inventory = await vms(credentials);
  return Promise.all(inventory.map(async (vm) => { const hourlyPrice = await hourlyPrice(vm); return { resourceId: vm.instanceId, vmSize: vm.vmSize, hourlyPrice, estimatedMonthlyCost: Number((hourlyPrice * 24 * 30).toFixed(2)), currency: 'USD' }; }));
}
async function azureResourcePricing(credentials, resources, serviceName, idKey, skuKey) {
  return Promise.all(resources.map(async (resource) => {
    const filter = `serviceName eq '${serviceName}' and armRegionName eq '${resource.location}' and armSkuName eq '${resource[skuKey]}' and priceType eq 'Consumption'`;
    const response = await fetch(`https://prices.azure.com/api/retail/prices?${new URLSearchParams({ '$filter': filter })}`);
    const body = response.ok ? await response.json() : { Items: [] };
    const item = body.Items?.find((price) => price.currencyCode === 'USD' && price.unitOfMeasure?.toLowerCase().includes('hour'));
    const hourlyPrice = Number(item?.retailPrice || 0);
    return { [idKey]: resource.resourceId, sku: resource[skuKey] || null, hourlyPrice, estimatedMonthlyCost: Number((hourlyPrice * 24 * 30).toFixed(2)), currency: 'USD', breakdown: { compute: Number((hourlyPrice * 24 * 30).toFixed(2)), variableUsage: 'Usage-based meters are not included' } };
  }));
}
async function storagePricing(credentials) { return azureResourcePricing(credentials, await storage(credentials), 'Storage', 'resourceId', 'sku'); }
async function databasePricing(credentials) { return azureResourcePricing(credentials, await databases(credentials), 'SQL Database', 'resourceId', 'sku'); }
async function dashboard(credentials) {
  const [inventory, accounts, dbs, prices] = await Promise.all([vms(credentials), storage(credentials), databases(credentials), vmPricing(credentials)]);
  return { totalResources: inventory.length + accounts.length + dbs.length, totalVMs: inventory.length, totalStorageAccounts: accounts.length, totalDatabases: dbs.length, estimatedMonthlyCost: Number(prices.reduce((sum, item) => sum + item.estimatedMonthlyCost, 0).toFixed(2)) };
}
module.exports = { vms, storage, databases, resources, vmMetrics, storageMetrics, databaseMetrics, vmDetail, vmPricing, storagePricing, databasePricing, dashboard };
