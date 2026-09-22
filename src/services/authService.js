const supabase = require("../config/supabase");
const { hashPassword, comparePassword } = require("../helpers/passwordHelper");
const { signToken } = require("../helpers/jwtHelper");

const publicUser = ({
  user_id,
  email,
  user_name,
  avatar_url,
  currency,
  timezone,
  created_at,
  updated_at,
}) => ({
  user_id,
  email,
  user_name,
  avatar_url,
  currency,
  timezone,
  created_at,
  updated_at,
});

async function signup({ email, password, user_name }) {
  const { data: existing } = await supabase
    .from("users")
    .select("user_id")
    .eq("email", email.toLowerCase())
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) {
    const error = new Error("Email is already registered");
    error.status = 409;
    throw error;
  }
  const { data, error } = await supabase
    .from("users")
    .insert({
      email: email.toLowerCase(),
      password_hash: await hashPassword(password),
      user_name,
    })
    .select()
    .single();
  if (error) throw error;
  return publicUser(data);
}
async function login({ email, password }) {
  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email.toLowerCase())
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!user || !(await comparePassword(password, user.password_hash))) {
    const err = new Error("Invalid email or password");
    err.status = 401;
    throw err;
  }
  return { token: signToken(user), user: publicUser(user) };
}
module.exports = { signup, login, publicUser };
