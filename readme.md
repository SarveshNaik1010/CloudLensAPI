# CloudLens Backend API

## Overview

CloudLens is a Unified Multi-Cloud Cost Intelligence and FinOps Platform.

The goal of the platform is to:

* Connect cloud providers (AWS, Azure, GCP)
* Discover cloud resources
* Monitor resource utilization
* Estimate and analyze cloud costs
* Provide optimization recommendations
* Support future forecasting and analytics

This backend currently focuses on:

1. User Authentication and Management
2. AWS, Azure, and GCP Cloud Connection Management
3. Cloud Resource Discovery
4. Cloud Utilization Monitoring
5. Cloud Cost Estimation

All APIs must return JSON responses.

---

# Technology Stack

* Node.js
* Express.js
* Supabase (PostgreSQL)
* JWT Authentication
* AWS SDK v3
* Google APIs client
* MVC Architecture

---

# Environment Variables

Create a `.env` file with the following fields:

```env
PORT=5000

JWT_SECRET=your_jwt_secret

SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
SUPABASE_JWKS_URL=
```

---

# Database

Use Supabase PostgreSQL.

Connection must be established using:

```env
SUPABASE_URL
SUPABASE_SECRET_KEY
```

Use the Supabase JS SDK.

---

# Database Schema

## users

Stores application users.

| Column        | Type        | Description                  |
| ------------- | ----------- | ---------------------------- |
| user_id       | uuid        | Primary Key                  |
| email         | varchar     | Unique email                 |
| password_hash | text        | Hashed password using bcrypt |
| user_name     | varchar     | User display name            |
| avatar_url    | text        | Optional avatar              |
| currency      | char        | Default USD                  |
| timezone      | varchar     | Default UTC                  |
| created_at    | timestamptz | Creation timestamp           |
| updated_at    | timestamptz | Update timestamp             |
| deleted_at    | timestamptz | Soft delete support          |

---

## cloud_connections

Stores cloud provider connections.

| Column              | Type        | Description              |
| ------------------- | ----------- | ------------------------ |
| connection_id       | uuid        | Primary Key              |
| user_id             | uuid        | FK -> users              |
| provider            | varchar     | AWS / AZURE / GCP        |
| provider_account_id | varchar     | Cloud account identifier |
| connection_name     | varchar     | User defined label       |
| credentials         | jsonb       | Provider credentials     |
| status              | varchar     | ACTIVE / DISABLED        |
| created_at          | timestamptz | Creation timestamp       |
| updated_at          | timestamptz | Update timestamp         |
| deleted_at          | timestamptz | Soft delete support      |

---

# Authentication

Authentication must use JWT.

Protected routes require:

```http
Authorization: Bearer <token>
```

Middleware should:

* Validate JWT
* Extract user_id
* Attach user object to request

---

# GCP APIs

Create a GCP cloud connection with provider `GCP` and a service account key. Credentials may be passed as a full `serviceAccountKey` JSON object, or as `projectId`, `clientEmail`, and `privateKey` fields. The service account needs project access to Compute Engine, Cloud Storage, Cloud SQL, Cloud Monitoring, and Cloud Billing Catalog APIs for the corresponding endpoints.

All GCP endpoints require a JWT. Pass `x-cloud-connection-id` to select a specific connection; otherwise the newest active GCP connection is used.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/gcp/resources` | Combined Compute Engine, Cloud Storage, and Cloud SQL inventory |
| GET | `/api/gcp/vms` | Compute Engine instances |
| GET | `/api/gcp/vms/:instanceId` | Instance details; accepts instance ID or name |
| GET | `/api/gcp/storage` | Storage buckets |
| GET | `/api/gcp/storage/:bucketName` | Bucket configuration |
| GET | `/api/gcp/databases` | Cloud SQL instances |
| GET | `/api/gcp/databases/:instanceName` | Cloud SQL instance details |
| GET | `/api/gcp/metrics/vm/:instanceId` | Compute Engine metrics |
| GET | `/api/gcp/metrics/storage/:bucketName` | Cloud Storage metrics |
| GET | `/api/gcp/metrics/database/:instanceName` | Cloud SQL metrics |
| GET | `/api/gcp/pricing/vms` | Compute Engine monthly cost estimates |
| GET | `/api/gcp/pricing/storage` | Storage monthly cost estimates |
| GET | `/api/gcp/pricing/databases` | Cloud SQL monthly cost estimates |
| GET | `/api/gcp/dashboard` | Resource totals and estimated VM costs |

Pricing responses are estimates and exclude usage charges such as network egress and operations where noted.

---

# API Response Format

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "message": "Error message"
}
```

---

# Authentication Routes

## POST /api/auth/signup

Register a user.

Request:

```json
{
  "email": "user@example.com",
  "password": "password123",
  "user_name": "Sarvesh"
}
```

Actions:

* Validate input
* Hash password using bcrypt
* Store in users table
* Return created user

Response:

```json
{
  "success": true,
  "data": {
    "user_id": "",
    "email": "",
    "user_name": ""
  }
}
```

---

## POST /api/auth/login

Authenticate user.

Request:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Actions:

* Validate credentials
* Compare bcrypt hash
* Generate JWT

Response:

```json
{
  "success": true,
  "token": "jwt_token",
  "data": {
    "user_id": "",
    "email": "",
    "user_name": ""
  }
}
```

---

# User Routes

Protected.

## GET /api/users/me

Get current user profile.

---

## PUT /api/users/me

Update profile.

Request:

```json
{
  "user_name": "",
  "avatar_url": "",
  "currency": "USD",
  "timezone": "UTC"
}
```

---

## DELETE /api/users/me

Soft delete user.

Actions:

```sql
deleted_at = CURRENT_TIMESTAMP
```

---

# Cloud Connection Routes

Protected.

Used to connect cloud providers.

Currently implement AWS only.

---

## POST /api/cloud-connections

Create cloud connection.

Request:

```json
{
  "provider": "AWS",
  "connection_name": "Production AWS",
  "provider_account_id": "287238357571",
  "credentials": {
    "accessKeyId": "",
    "secretAccessKey": "",
    "region": "eu-north-1"
  }
}
```

Actions:

* Validate credentials
* Verify AWS account
* Store encrypted credentials
* Store connection

Response:

```json
{
  "success": true,
  "data": {}
}
```

---

## GET /api/cloud-connections

Get all user cloud connections.

---

## GET /api/cloud-connections/:connectionId

Get single connection.

---

## PUT /api/cloud-connections/:connectionId

Update connection.

---

## DELETE /api/cloud-connections/:connectionId

Soft delete connection.

---

# AWS Integration

AWS credentials are stored in:

```json
{
  "accessKeyId": "",
  "secretAccessKey": "",
  "region": ""
}
```

# Unified Dashboard API

All dashboard routes require a JWT. They aggregate resources from every active
connection owned by the authenticated user. Provider request failures are
reported in the response data while successful providers continue to appear.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/dashboard/summary` | Active resource count and explicit availability states for cost, savings, and forecast |
| GET | `/api/dashboard/resources` | Normalized, filtered, paginated multi-cloud inventory |
| GET | `/api/dashboard/cost-by-resource-type` | Category cost response; amounts are null until billing integrations exist |
| GET | `/api/dashboard/cost-comparison` | Monthly cost series response; periods are empty until billing integrations exist |
| GET | `/api/dashboard/filters` | Available inventory filter values |
| GET | `/api/dashboard/forecast` | Explicit unsupported response until billing history/provider forecasts exist |
| GET | `/api/dashboard/savings` | Explicit unsupported response until provider recommendations exist |

Inventory accepts `page`, `pageSize` (maximum 100), `provider`, `accountId`,
`category`, `resourceType`, `region`, `status`, and `tag`. Successful resource
items share `resourceId`, `resourceName`, `provider`, `accountId`,
`resourceType`, `category`, `region`, `availabilityZone`, `status`, `createdAt`,
`cost`, `currency`, `utilization`, `tags`, and `metadata`. Unknown values are
`null`. Cost and utilization are not inferred from pricing estimates or
monitoring data; corresponding normalized fields remain null until connected to
real per-resource data.

Existing `/api/{aws,azure,gcp}/pricing/*` endpoints remain estimates for their
documented resource types. They are not billing actuals and are not included in
dashboard spend aggregates. Dashboard cost, forecast, and savings values report
unsupported/null states because the current integrations do not retrieve
normalized billing history or recommendations.

AWS SDK v3 must be used.

---

# AWS Resource Discovery

## GET /api/aws/resources

Protected.

Returns unified AWS resources.

Sources:

* EC2 DescribeInstances
* S3 ListBuckets
* RDS DescribeDBInstances

Response:

```json
{
  "success": true,
  "data": [
    {
      "resourceId": "",
      "resourceName": "",
      "provider": "AWS",
      "resourceType": "EC2",
      "region": "",
      "status": "running"
    }
  ]
}
```

---

# AWS Compute Resources

## GET /api/aws/ec2

Returns EC2 inventory.

Fields:

```json
{
  "instanceId": "",
  "instanceName": "",
  "instanceType": "",
  "state": "",
  "region": ""
}
```

Source:

```text
DescribeInstances
```

---

# AWS Storage Resources

## GET /api/aws/s3

Returns S3 buckets.

Fields:

```json
{
  "bucketName": "",
  "creationDate": ""
}
```

Source:

```text
ListBuckets
```

---

# AWS Database Resources

## GET /api/aws/rds

Returns RDS instances.

Fields:

```json
{
  "dbIdentifier": "",
  "engine": "",
  "status": ""
}
```

Source:

```text
DescribeDBInstances
```

---

# AWS Utilization Metrics

Used for dashboards and recommendations.

## GET /api/aws/metrics/ec2/:instanceId

Returns utilization metrics.

Source:

```text
AWS CloudWatch
```

Metrics:

* CPU Utilization
* Network In
* Network Out
* Disk Read Ops
* Disk Write Ops

Response:

```json
{
  "instanceId": "",
  "cpuUtilization": 12.4,
  "networkIn": 1234,
  "networkOut": 4321,
  "diskReadOps": 12,
  "diskWriteOps": 20
}
```

Note:

Memory utilization is not available by default through CloudWatch for EC2.
It requires CloudWatch Agent to be installed on instances.
CPU metrics must be implemented first.

---

# AWS Cost Estimation

Purpose:

Provide estimated monthly cost without relying on Cost Explorer.

Sources:

* AWS Pricing API
* AWS Resource APIs

---

## GET /api/aws/pricing/ec2

Returns pricing for discovered EC2 instances.

Response:

```json
{
  "success": true,
  "data": [
    {
      "instanceId": "",
      "instanceType": "t3.micro",
      "hourlyPrice": 0.0104,
      "estimatedMonthlyCost": 7.49,
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

## GET /api/aws/dashboard

Aggregated dashboard endpoint.

Returns:

```json
{
  "totalResources": 10,
  "totalEC2": 4,
  "totalS3": 3,
  "totalRDS": 3,
  "estimatedMonthlyCost": 45.23
}
```

Used by dashboard summary cards.

---

# Future Endpoints (Not Required Now)

## Recommendations

```http
GET /api/recommendations
```

Based on:

* Pricing API
* CloudWatch Metrics

Examples:

* Scale Down
* Scale Up
* Delete Idle Resource

---

## Forecasting

```http
GET /api/forecasting
```

Based on historical resource and pricing data.

---

# Folder Structure

```text
src/
│
├── config/
│   ├── supabase.js
│   ├── aws.js
│
├── controllers/
│   ├── authController.js
│   ├── userController.js
│   ├── cloudConnectionController.js
│   ├── awsController.js
│
├── services/
│   ├── authService.js
│   ├── userService.js
│   ├── cloudConnectionService.js
│   ├── awsService.js
│
├── models/
│
├── routes/
│   ├── authRoutes.js
│   ├── userRoutes.js
│   ├── cloudConnectionRoutes.js
│   ├── awsRoutes.js
│
├── middleware/
│   ├── authMiddleware.js
│
├── helpers/
│   ├── jwtHelper.js
│   ├── passwordHelper.js
│   ├── awsHelper.js
│   ├── responseHelper.js
│
├── app.js
├── server.js
│
└── .env
```

---

# Coding Requirements

* Use async/await
* Use MVC architecture
* Use service layer for business logic
* Controllers should remain thin
* AWS SDK v3 only
* bcrypt for password hashing
* JWT for authentication
* Supabase as primary database
* Soft delete wherever applicable
* All responses must be JSON
* Follow REST conventions
* Proper validation and error handling required

---

# Running the API

1. Run `npm install`.
2. Execute [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor.
3. Set the documented environment variables in `.env`, then run `npm start`.

The API listens on `PORT` (default `5000`). `GET /health` is available without authentication.

AWS endpoints use the most recently created active AWS connection. Send an optional
`x-cloud-connection-id` header to select a particular active connection.
