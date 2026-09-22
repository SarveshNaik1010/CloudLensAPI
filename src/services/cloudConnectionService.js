const supabase = require("../config/supabase");
const { GetCallerIdentityCommand } = require("@aws-sdk/client-sts");
const { createAwsClients } = require("../config/aws");
const { createAzureClients } = require("../config/azure");
const { encrypt, decrypt } = require("../helpers/credentialsHelper");

const publicConnection = ({ credentials, ...connection }) => connection;

async function verifyAws(credentials) {
  const result = await createAwsClients(credentials).sts.send(
    new GetCallerIdentityCommand({}),
  );
  return result.Account;
}
async function verifyAzure(credentials) {
  const subscription = await createAzureClients(
    credentials,
  ).subscriptions.subscriptions.get(credentials.subscriptionId);
  return subscription.subscriptionId || credentials.subscriptionId;
}
async function create(userId, input) {
  const accountId =
    input.provider === "AWS"
      ? await verifyAws(input.credentials)
      : await verifyAzure(input.credentials);
  if (input.provider_account_id && input.provider_account_id !== accountId) {
    const error = new Error(
      "provider_account_id does not match the supplied cloud credentials",
    );
    error.status = 400;
    throw error;
  }
  const record = {
    user_id: userId,
    provider: input.provider,
    connection_name: input.connection_name,
    provider_account_id: accountId,
    credentials: encrypt(input.credentials),
    status: "ACTIVE",
  };
  const { data, error } = await supabase
    .from("cloud_connections")
    .insert(record)
    .select()
    .single();
  if (error) throw error;
  return publicConnection(data);
}
async function list(userId) {
  const { data, error } = await supabase
    .from("cloud_connections")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(publicConnection);
}
async function get(userId, connectionId, includeCredentials = false) {
  const { data, error } = await supabase
    .from("cloud_connections")
    .select("*")
    .eq("connection_id", connectionId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const err = new Error("Cloud connection not found");
    err.status = 404;
    throw err;
  }
  return includeCredentials
    ? { ...data, credentials: decrypt(data.credentials) }
    : publicConnection(data);
}
async function update(userId, connectionId, input) {
  await get(userId, connectionId);
  const changes = {};
  for (const field of ["connection_name", "provider_account_id", "status"])
    if (input[field] !== undefined) changes[field] = input[field];
  if (input.credentials) {
    const existing = await get(userId, connectionId, true);
    const account =
      existing.provider === "AWS"
        ? await verifyAws(input.credentials)
        : await verifyAzure(input.credentials);
    changes.credentials = encrypt(input.credentials);
    changes.provider_account_id = account;
  }
  const { data, error } = await supabase
    .from("cloud_connections")
    .update(changes)
    .eq("connection_id", connectionId)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw error;
  return publicConnection(data);
}
async function remove(userId, connectionId) {
  await get(userId, connectionId);
  const { error } = await supabase
    .from("cloud_connections")
    .update({ deleted_at: new Date().toISOString() })
    .eq("connection_id", connectionId)
    .eq("user_id", userId);
  if (error) throw error;
}
async function activeAwsCredentials(userId, connectionId) {
  let connection;
  if (connectionId) connection = await get(userId, connectionId, true);
  else {
    const { data, error } = await supabase
      .from("cloud_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "AWS")
      .eq("status", "ACTIVE")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    connection = data && { ...data, credentials: decrypt(data.credentials) };
  }
  if (
    !connection ||
    connection.provider !== "AWS" ||
    connection.status !== "ACTIVE"
  ) {
    const error = new Error("An active AWS connection is required");
    error.status = 400;
    throw error;
  }
  return connection;
}
async function activeAzureCredentials(userId, connectionId) {
  let connection;
  if (connectionId) connection = await get(userId, connectionId, true);
  else {
    const { data, error } = await supabase
      .from("cloud_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "AZURE")
      .eq("status", "ACTIVE")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    connection = data && { ...data, credentials: decrypt(data.credentials) };
  }
  if (
    !connection ||
    connection.provider !== "AZURE" ||
    connection.status !== "ACTIVE"
  ) {
    const error = new Error("An active Azure connection is required");
    error.status = 400;
    throw error;
  }
  return connection;
}
module.exports = {
  create,
  list,
  get,
  update,
  remove,
  activeAwsCredentials,
  activeAzureCredentials,
};
