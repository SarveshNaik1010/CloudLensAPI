const connections = require("../services/cloudConnectionService");
const aws = require("../services/awsService");
const { success } = require("../helpers/responseHelper");
async function withAws(req, callback) {
  const connection = await connections.activeAwsCredentials(
    req.user.user_id,
    req.get("x-cloud-connection-id"),
  );
  return callback(connection.credentials);
}
const handler = (method) => async (req, res, next) => {
  try {
    return success(
      res,
      await withAws(req, (credentials) => method(credentials, req)),
    );
  } catch (e) {
    next(e);
  }
};
module.exports = {
  resources: handler((c) => aws.resources(c)),
  ec2: handler((c) => aws.ec2(c)),
  s3: handler((c) => aws.s3(c)),
  rds: handler((c) => aws.rds(c)),
  metrics: handler((c, req) => aws.ec2Metrics(c, req.params.instanceId)),
  s3Metrics: handler((c, req) => aws.s3Metrics(c, req.params.bucketName)),
  rdsMetrics: handler((c, req) => aws.rdsMetrics(c, req.params.dbIdentifier)),
  ec2Detail: handler((c, req) => aws.ec2Detail(c, req.params.instanceId)),
  s3Detail: handler((c, req) => aws.s3Detail(c, req.params.bucketName)),
  rdsDetail: handler((c, req) => aws.rdsDetail(c, req.params.dbIdentifier)),
  pricing: handler((c) => aws.ec2Pricing(c)),
  s3Pricing: handler((c) => aws.s3Pricing(c)),
  rdsPricing: handler((c) => aws.rdsPricing(c)),
  dashboard: handler((c) => aws.dashboard(c)),
};
