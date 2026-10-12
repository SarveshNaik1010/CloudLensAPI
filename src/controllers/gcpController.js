const connections = require("../services/cloudConnectionService");
const gcp = require("../services/gcpService");
const { success } = require("../helpers/responseHelper");
async function withGcp(req, callback) {
  const connection = await connections.activeGcpCredentials(req.user.user_id, req.get("x-cloud-connection-id"));
  return callback(connection.credentials);
}
const handler = (method) => async (req, res, next) => {
  try { return success(res, await withGcp(req, (credentials) => method(credentials, req))); }
  catch (error) { next(error); }
};
module.exports = {
  resources: handler((c) => gcp.resources(c)), vms: handler((c) => gcp.vms(c)),
  storage: handler((c) => gcp.storage(c)), databases: handler((c) => gcp.databases(c)),
  vmDetail: handler((c, r) => gcp.vmDetail(c, r.params.instanceId)),
  storageDetail: handler((c, r) => gcp.storageDetail(c, r.params.bucketName)),
  databaseDetail: handler((c, r) => gcp.databaseDetail(c, r.params.instanceName)),
  vmMetrics: handler((c, r) => gcp.vmMetrics(c, r.params.instanceId)),
  storageMetrics: handler((c, r) => gcp.storageMetrics(c, r.params.bucketName)),
  databaseMetrics: handler((c, r) => gcp.databaseMetrics(c, r.params.instanceName)),
  vmPricing: handler((c) => gcp.vmPricing(c)), storagePricing: handler((c) => gcp.storagePricing(c)),
  databasePricing: handler((c) => gcp.databasePricing(c)), dashboard: handler((c) => gcp.dashboard(c)),
};
