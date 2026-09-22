const { ClientSecretCredential } = require('@azure/identity');
const { SubscriptionClient } = require('@azure/arm-subscriptions');
const { ComputeManagementClient } = require('@azure/arm-compute');
const { ResourceGraphClient } = require('@azure/arm-resourcegraph');
const { MetricsQueryClient } = require('@azure/monitor-query');

function createAzureClients(credentials) {
  const credential = new ClientSecretCredential(credentials.tenantId, credentials.clientId, credentials.clientSecret);
  return {
    credential,
    subscriptions: new SubscriptionClient(credential),
    compute: new ComputeManagementClient(credential, credentials.subscriptionId),
    resourceGraph: new ResourceGraphClient(credential),
    metrics: new MetricsQueryClient(credential),
  };
}

module.exports = { createAzureClients };
