# Azure Integration

Azure support should follow the same architecture and flow as AWS.

The goal is to allow users to:

* Connect Azure subscriptions
* Discover Azure resources
* Retrieve utilization metrics
* Estimate cloud costs
* Support future recommendations and forecasting

---

# Azure Credentials

Azure connections are stored in:

```json
{
  "tenantId": "",
  "clientId": "",
  "clientSecret": "",
  "subscriptionId": ""
}
```

Azure SDK for JavaScript must be used.

---

# Azure Authentication

CloudLens should authenticate using a Service Principal.

Required values:

```text
Tenant ID
Client ID
Client Secret
Subscription ID
```

These credentials are generated from:

```text
Azure Portal
→ Microsoft Entra ID (Azure AD)
→ App Registrations
→ Create Application
→ Create Client Secret
```

The connected Service Principal should have at minimum:

```text
Reader
Cost Management Reader
Monitoring Reader
```

permissions on the target subscription.

---

# Cloud Connection Route Updates

## POST /api/cloud-connections

Support both AWS and Azure.

AWS Request:

```json
{
  "provider": "AWS",
  "connection_name": "Production AWS",
  "credentials": {
    "accessKeyId": "",
    "secretAccessKey": "",
    "region": "eu-north-1"
  }
}
```

Azure Request:

```json
{
  "provider": "AZURE",
  "connection_name": "Production Azure",
  "credentials": {
    "tenantId": "",
    "clientId": "",
    "clientSecret": "",
    "subscriptionId": ""
  }
}
```

---

# Azure Credential Validation

Required fields:

```js
function validAzureCredentials(c) {
  return (
    c &&
    typeof c.tenantId === "string" &&
    typeof c.clientId === "string" &&
    typeof c.clientSecret === "string" &&
    typeof c.subscriptionId === "string"
  );
}
```

---

# Azure Connection Verification

Upon connection creation:

1. Authenticate using Service Principal
2. Verify subscription access
3. Retrieve subscription metadata
4. Store connection

Retrieve:

```text
Subscription ID
Subscription Name
Tenant ID
```

Store subscription ID as:

```text
provider_account_id
```

---

# Azure Resource Discovery

## GET /api/azure/resources

Protected.

Returns unified Azure resources.

Source:

```text
Azure Resource Graph
```

Response:

```json
{
  "success": true,
  "data": [
    {
      "resourceId": "",
      "resourceName": "",
      "provider": "AZURE",
      "resourceType": "VirtualMachine",
      "region": "Central India",
      "status": "running"
    }
  ]
}
```

---

# Azure Virtual Machines

## GET /api/azure/vms

Source:

```text
Azure Compute Management API
```

Response:

```json
{
  "instanceId": "",
  "instanceName": "",
  "vmSize": "",
  "powerState": "",
  "region": ""
}
```

---

# Azure Storage Accounts

## GET /api/azure/storage

Source:

```text
Azure Resource Graph
```

Response:

```json
{
  "storageAccountName": "",
  "location": ""
}
```

---

# Azure Databases

## GET /api/azure/databases

Sources:

* Azure SQL
* Azure PostgreSQL
* Azure MySQL

Response:

```json
{
  "databaseName": "",
  "engine": "",
  "status": ""
}
```

---

# Azure Utilization Metrics

## GET /api/azure/metrics/vm/:resourceId

Source:

```text
Azure Monitor
```

Metrics:

* CPU Percentage
* Network In
* Network Out
* Disk Read Operations
* Disk Write Operations

Response:

```json
{
  "resourceId": "",
  "cpuUtilization": 15.2,
  "networkIn": 2000,
  "networkOut": 5000,
  "diskReadOps": 100,
  "diskWriteOps": 80
}
```

---

# Azure Cost Estimation

Purpose:

Provide estimated monthly cost without relying solely on Cost Management APIs.

Sources:

* Azure Retail Prices API
* Azure Resource APIs

---

## GET /api/azure/pricing/vms

Response:

```json
{
  "success": true,
  "data": [
    {
      "resourceId": "",
      "vmSize": "Standard_B1s",
      "hourlyPrice": 0.012,
      "estimatedMonthlyCost": 8.64,
      "currency": "USD"
    }
  ]
}
```

Pricing Calculation:

```text
Estimated Monthly Cost
=
Hourly Price × 24 × 30
```

---

# Azure Dashboard

## GET /api/azure/dashboard

Response:

```json
{
  "totalResources": 20,
  "totalVMs": 8,
  "totalStorageAccounts": 5,
  "totalDatabases": 7,
  "estimatedMonthlyCost": 120.50
}
```

---

# Azure SDK Packages

Install:

```bash
npm install @azure/identity
npm install @azure/arm-resources
npm install @azure/arm-compute
npm install @azure/arm-monitor
npm install @azure/arm-costmanagement
npm install @azure/arm-subscriptions
```

The implementation also uses `@azure/arm-resourcegraph` for discovery and
`@azure/monitor-query` for Azure Monitor metrics.

---

# Azure Services Used

| Purpose                 | Azure Service             |
| ----------------------- | ------------------------- |
| Authentication          | Azure Identity            |
| Resource Discovery      | Azure Resource Graph      |
| VM Inventory            | Azure Compute             |
| Metrics                 | Azure Monitor             |
| Subscription Validation | Azure Subscriptions       |
| Cost Estimation         | Azure Retail Prices API   |
| Actual Billing (Future) | Azure Cost Management API |

---

# Future Azure Enhancements

## Recommendations

```http
GET /api/azure/recommendations
```

Examples:

* Underutilized VM
* Oversized VM
* Idle Resource
* Storage Optimization

---

## Forecasting

```http
GET /api/azure/forecasting
```

Based on:

* Historical utilization
* Historical pricing
* Resource growth trends
