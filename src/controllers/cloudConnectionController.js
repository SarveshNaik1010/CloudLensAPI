const service = require("../services/cloudConnectionService");
const { success, failure } = require("../helpers/responseHelper");
function validCredentials(c) {
  return (
    c &&
    typeof c.accessKeyId === "string" &&
    typeof c.secretAccessKey === "string" &&
    typeof c.region === "string"
  );
}
function validAzureCredentials(c) {
  return (
    c &&
    typeof c.tenantId === "string" &&
    typeof c.clientId === "string" &&
    typeof c.clientSecret === "string" &&
    typeof c.subscriptionId === "string"
  );
}
async function create(req, res, next) {
  try {
    const { provider, connection_name, credentials } = req.body;
    if (
      !["AWS", "AZURE"].includes(provider) ||
      !connection_name?.trim() ||
      !(provider === "AWS"
        ? validCredentials(credentials)
        : validAzureCredentials(credentials))
    )
      return failure(
        res,
        "A supported provider, connection_name, and valid provider credentials are required",
      );
    return success(res, await service.create(req.user.user_id, req.body), 201);
  } catch (e) {
    next(e);
  }
}
async function list(req, res, next) {
  try {
    return success(res, await service.list(req.user.user_id));
  } catch (e) {
    next(e);
  }
}
async function get(req, res, next) {
  try {
    return success(
      res,
      await service.get(req.user.user_id, req.params.connectionId),
    );
  } catch (e) {
    next(e);
  }
}
async function update(req, res, next) {
  try {
    if (req.body.provider) return failure(res, "provider cannot be changed");
    if (
      req.body.credentials &&
      !validCredentials(req.body.credentials) &&
      !validAzureCredentials(req.body.credentials)
    )
      return failure(res, "credentials must contain valid AWS or Azure fields");
    return success(
      res,
      await service.update(req.user.user_id, req.params.connectionId, req.body),
    );
  } catch (e) {
    next(e);
  }
}
async function remove(req, res, next) {
  try {
    await service.remove(req.user.user_id, req.params.connectionId);
    return success(res, { message: "Cloud connection deleted" });
  } catch (e) {
    next(e);
  }
}
module.exports = { create, list, get, update, remove };
