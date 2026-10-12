const dashboard = require("../services/dashboardService");
const { success } = require("../helpers/responseHelper");
const handler = (method) => async (req, res, next) => {
  try { return success(res, await method(req)); } catch (error) { return next(error); }
};
module.exports = {
  summary: handler((req) => dashboard.summary(req.user.user_id)),
  resources: handler((req) => dashboard.resourcesPage(req.user.user_id, req.query)),
  categoryCosts: handler((req) => dashboard.categoryCosts(req.user.user_id)),
  comparison: handler((req) => dashboard.comparison(req.user.user_id)),
  filters: handler((req) => dashboard.filters(req.user.user_id)),
};
