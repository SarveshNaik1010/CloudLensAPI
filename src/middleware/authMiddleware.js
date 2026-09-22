const supabase = require("../config/supabase");
const { verifyToken } = require("../helpers/jwtHelper");
const { failure } = require("../helpers/responseHelper");

async function authenticate(req, res, next) {
  try {
    const header = req.get("authorization");
    if (!header?.startsWith("Bearer "))
      return failure(res, "Authorization bearer token is required", 401);
    const payload = verifyToken(header.slice(7));
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("user_id", payload.user_id)
      .is("deleted_at", null)
      .single();
    if (error || !user) return failure(res, "User not found or deleted", 401);
    req.user = user;
    next();
  } catch (error) {
    return failure(res, "Invalid or expired authentication token", 401);
  }
}
module.exports = { authenticate };
