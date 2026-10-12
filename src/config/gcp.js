const { google } = require("googleapis");

function createGcpClients(credentials) {
  const key = credentials.serviceAccountKey || {
    type: "service_account",
    project_id: credentials.projectId,
    client_email: credentials.clientEmail,
    private_key: credentials.privateKey,
  };
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  return {
    auth,
    compute: google.compute({ version: "v1", auth }),
    storage: google.storage({ version: "v1", auth }),
    sql: google.sqladmin({ version: "v1", auth }),
    monitoring: google.monitoring({ version: "v3", auth }),
    billing: google.cloudbilling({ version: "v1", auth }),
    projects: google.cloudresourcemanager({ version: "v1", auth }),
  };
}

module.exports = { createGcpClients };
