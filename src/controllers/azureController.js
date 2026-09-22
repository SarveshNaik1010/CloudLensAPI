const connections = require('../services/cloudConnectionService');
const azure = require('../services/azureService');
const { success } = require('../helpers/responseHelper');

async function withAzure(req, callback) {
  const connection = await connections.activeAzureCredentials(req.user.user_id, req.get('x-cloud-connection-id'));
  return callback(connection.credentials);
}
const handler = (method) => async (req, res, next) => {
  try { return success(res, await withAzure(req, (credentials) => method(credentials, req))); } catch (error) { next(error); }
};
module.exports = {
  resources: handler((c) => azure.resources(c)), vms: handler((c) => azure.vms(c)), storage: handler((c) => azure.storage(c)), databases: handler((c) => azure.databases(c)),
  metrics: handler((c, req) => azure.vmMetrics(c, req.params.resourceId)), storageMetrics: handler((c, req) => azure.storageMetrics(c, req.params.resourceId)), databaseMetrics: handler((c, req) => azure.databaseMetrics(c, req.params.resourceId)), vmDetail: handler((c, req) => azure.vmDetail(c, req.params.resourceId)), pricing: handler((c) => azure.vmPricing(c)), storagePricing: handler((c) => azure.storagePricing(c)), databasePricing: handler((c) => azure.databasePricing(c)), dashboard: handler((c) => azure.dashboard(c)),
};
