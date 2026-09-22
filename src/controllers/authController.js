const authService = require("../services/authService");
const { success, failure } = require("../helpers/responseHelper");
const validEmail = (value) => /^\S+@\S+\.\S+$/.test(value || "");
async function signup(req, res, next) {
  try {
    const { email, password, user_name } = req.body;
    if (
      !validEmail(email) ||
      typeof password !== "string" ||
      password.length < 8 ||
      !user_name?.trim()
    )
      return failure(
        res,
        "Password of at least 8 characters is required",
      );
    return success(
      res,
      await authService.signup({
        email,
        password,
        user_name: user_name.trim(),
      }),
      201,
    );
  } catch (e) {
    next(e);
  }
}
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!validEmail(email) || !password)
      return failure(res, "Valid email and password are required");
    const result = await authService.login({ email, password });
    return success(res, result.user, 200, { token: result.token });
  } catch (e) {
    next(e);
  }
}
module.exports = { signup, login };
