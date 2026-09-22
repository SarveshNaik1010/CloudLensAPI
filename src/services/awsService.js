const { DescribeInstancesCommand } = require("@aws-sdk/client-ec2");
const {
  ListBucketsCommand,
  GetBucketLocationCommand,
  GetBucketVersioningCommand,
  GetBucketEncryptionCommand,
} = require("@aws-sdk/client-s3");
const { DescribeDBInstancesCommand } = require("@aws-sdk/client-rds");
const { GetMetricStatisticsCommand } = require("@aws-sdk/client-cloudwatch");
const { GetProductsCommand } = require("@aws-sdk/client-pricing");
const { createAwsClients } = require("../config/aws");

const name = (tags = []) => tags.find((tag) => tag.Key === "Name")?.Value;
async function ec2(credentials) {
  const result = await createAwsClients(credentials).ec2.send(
    new DescribeInstancesCommand({}),
  );
  return (result.Reservations || [])
    .flatMap((r) => r.Instances || [])
    .map((i) => ({
      instanceId: i.InstanceId,
      instanceName: name(i.Tags) || i.InstanceId,
      instanceType: i.InstanceType,
      state: i.State?.Name,
      region: credentials.region,
    }));
}
async function s3(credentials) {
  const result = await createAwsClients(credentials).s3.send(
    new ListBucketsCommand({}),
  );
  return (result.Buckets || []).map((bucket) => ({
    bucketName: bucket.Name,
    creationDate: bucket.CreationDate?.toISOString(),
  }));
}
async function rds(credentials) {
  const result = await createAwsClients(credentials).rds.send(
    new DescribeDBInstancesCommand({}),
  );
  return (result.DBInstances || []).map((db) => ({
    dbIdentifier: db.DBInstanceIdentifier,
    engine: db.Engine,
    status: db.DBInstanceStatus,
  }));
}
async function resources(credentials) {
  const [instances, buckets, databases] = await Promise.all([
    ec2(credentials),
    s3(credentials),
    rds(credentials),
  ]);
  return [
    ...instances.map((x) => ({
      resourceId: x.instanceId,
      resourceName: x.instanceName,
      provider: "AWS",
      resourceType: "EC2",
      region: x.region,
      status: x.state,
    })),
    ...buckets.map((x) => ({
      resourceId: x.bucketName,
      resourceName: x.bucketName,
      provider: "AWS",
      resourceType: "S3",
      region: "global",
      status: "available",
    })),
    ...databases.map((x) => ({
      resourceId: x.dbIdentifier,
      resourceName: x.dbIdentifier,
      provider: "AWS",
      resourceType: "RDS",
      region: credentials.region,
      status: x.status,
    })),
  ];
}
async function metric(
  credentials,
  instanceId,
  metricName,
  statistic = "Average",
) {
  const end = new Date();
  const start = new Date(end.getTime() - 60 * 60 * 1000);
  const response = await createAwsClients(credentials).cloudWatch.send(
    new GetMetricStatisticsCommand({
      Namespace: "AWS/EC2",
      MetricName: metricName,
      Dimensions: [{ Name: "InstanceId", Value: instanceId }],
      StartTime: start,
      EndTime: end,
      Period: 3600,
      Statistics: [statistic],
    }),
  );
  return (
    response.Datapoints?.sort((a, b) => b.Timestamp - a.Timestamp)[0]?.[
      statistic
    ] ?? 0
  );
}
async function ec2Metrics(credentials, instanceId) {
  const [cpuUtilization, networkIn, networkOut, diskReadOps, diskWriteOps] =
    await Promise.all([
      metric(credentials, instanceId, "CPUUtilization"),
      metric(credentials, instanceId, "NetworkIn", "Sum"),
      metric(credentials, instanceId, "NetworkOut", "Sum"),
      metric(credentials, instanceId, "DiskReadOps", "Sum"),
      metric(credentials, instanceId, "DiskWriteOps", "Sum"),
    ]);
  return {
    instanceId,
    cpuUtilization,
    networkIn,
    networkOut,
    diskReadOps,
    diskWriteOps,
  };
}
async function serviceMetric(
  credentials,
  namespace,
  dimensions,
  metricName,
  statistic = "Average",
  lookbackMs = 3600000,
  period = 3600,
) {
  const end = new Date();
  const start = new Date(end.getTime() - lookbackMs);
  const response = await createAwsClients(credentials).cloudWatch.send(
    new GetMetricStatisticsCommand({
      Namespace: namespace,
      MetricName: metricName,
      Dimensions: dimensions,
      StartTime: start,
      EndTime: end,
      Period: period,
      Statistics: [statistic],
    }),
  );
  return (
    response.Datapoints?.sort((a, b) => b.Timestamp - a.Timestamp)[0]?.[
      statistic
    ] ?? 0
  );
}
async function ec2Detail(credentials, instanceId) {
  const result = await createAwsClients(credentials).ec2.send(
    new DescribeInstancesCommand({ InstanceIds: [instanceId] }),
  );
  const instance = result.Reservations?.[0]?.Instances?.[0];
  if (!instance) {
    const error = new Error("EC2 instance not found");
    error.status = 404;
    throw error;
  }
  return {
    instanceId: instance.InstanceId,
    instanceName: name(instance.Tags) || instance.InstanceId,
    instanceType: instance.InstanceType,
    state: instance.State?.Name,
    region: credentials.region,
    availabilityZone: instance.Placement?.AvailabilityZone,
    launchTime: instance.LaunchTime,
    imageId: instance.ImageId,
    platform: instance.PlatformDetails,
    vpcId: instance.VpcId,
    subnetId: instance.SubnetId,
    privateIp: instance.PrivateIpAddress,
    publicIp: instance.PublicIpAddress,
    securityGroups:
      instance.SecurityGroups?.map((group) => ({
        id: group.GroupId,
        name: group.GroupName,
      })) || [],
    tags: instance.Tags || [],
  };
}
async function s3Detail(credentials, bucketName) {
  const { s3: client } = createAwsClients(credentials);
  const [location, versioning, encryption] = await Promise.all([
    client.send(new GetBucketLocationCommand({ Bucket: bucketName })),
    client.send(new GetBucketVersioningCommand({ Bucket: bucketName })),
    client
      .send(new GetBucketEncryptionCommand({ Bucket: bucketName }))
      .catch(() => null),
  ]);
  return {
    bucketName,
    region: location.LocationConstraint || "us-east-1",
    versioning: versioning.Status || "Disabled",
    encryption:
      encryption?.ServerSideEncryptionConfiguration?.Rules?.[0]
        ?.ApplyServerSideEncryptionByDefault?.SSEAlgorithm || "None",
  };
}
async function rdsDetail(credentials, dbIdentifier) {
  const result = await createAwsClients(credentials).rds.send(
    new DescribeDBInstancesCommand({ DBInstanceIdentifier: dbIdentifier }),
  );
  const db = result.DBInstances?.[0];
  if (!db) {
    const error = new Error("RDS instance not found");
    error.status = 404;
    throw error;
  }
  return {
    dbIdentifier: db.DBInstanceIdentifier,
    engine: db.Engine,
    engineVersion: db.EngineVersion,
    status: db.DBInstanceStatus,
    instanceClass: db.DBInstanceClass,
    allocatedStorageGB: db.AllocatedStorage,
    storageType: db.StorageType,
    multiAZ: db.MultiAZ,
    availabilityZone: db.AvailabilityZone,
    endpoint: db.Endpoint?.Address,
    port: db.Endpoint?.Port,
    publiclyAccessible: db.PubliclyAccessible,
    backupRetentionDays: db.BackupRetentionPeriod,
    createdAt: db.InstanceCreateTime,
  };
}
async function s3Metrics(credentials, bucketName) {
  const dimensions = [
    { Name: "BucketName", Value: bucketName },
    { Name: "StorageType", Value: "StandardStorage" },
  ];
  const objectDimensions = [
    { Name: "BucketName", Value: bucketName },
    { Name: "StorageType", Value: "AllStorageTypes" },
  ];
  const [storageBytes, objectCount] = await Promise.all([
    serviceMetric(
      credentials,
      "AWS/S3",
      dimensions,
      "BucketSizeBytes",
      "Average",
      172800000,
      86400,
    ),
    serviceMetric(
      credentials,
      "AWS/S3",
      objectDimensions,
      "NumberOfObjects",
      "Average",
      172800000,
      86400,
    ),
  ]);
  return {
    bucketName,
    storageBytes,
    storageGB: Number((storageBytes / 1024 ** 3).toFixed(4)),
    objectCount,
    period: "Latest daily S3 storage metric",
  };
}
async function rdsMetrics(credentials, dbIdentifier) {
  const dimensions = [{ Name: "DBInstanceIdentifier", Value: dbIdentifier }];
  const entries = await Promise.all(
    [
      ["cpuUtilization", "CPUUtilization"],
      ["databaseConnections", "DatabaseConnections"],
      ["freeStorageBytes", "FreeStorageSpace"],
      ["readIOPS", "ReadIOPS"],
      ["writeIOPS", "WriteIOPS"],
      ["networkReceiveBytes", "NetworkReceiveThroughput"],
      ["networkTransmitBytes", "NetworkTransmitThroughput"],
    ].map(async ([key, metricName]) => [
      key,
      await serviceMetric(
        credentials,
        "AWS/RDS",
        dimensions,
        metricName,
        key.includes("network") ? "Sum" : "Average",
      ),
    ]),
  );
  return { dbIdentifier, ...Object.fromEntries(entries) };
}
async function priceForInstance(credentials, instanceType) {
  const filters = [
    { Type: "TERM_MATCH", Field: "termType", Value: "OnDemand" },
    { Type: "TERM_MATCH", Field: "productFamily", Value: "Compute Instance" },
    { Type: "TERM_MATCH", Field: "instanceType", Value: instanceType },
    { Type: "TERM_MATCH", Field: "regionCode", Value: credentials.region },
    { Type: "TERM_MATCH", Field: "operatingSystem", Value: "Linux" },
    { Type: "TERM_MATCH", Field: "tenancy", Value: "Shared" },
    { Type: "TERM_MATCH", Field: "preInstalledSw", Value: "NA" },
    { Type: "TERM_MATCH", Field: "capacitystatus", Value: "Used" },
  ];
  const result = await createAwsClients(credentials).pricing.send(
    new GetProductsCommand({
      ServiceCode: "AmazonEC2",
      Filters: filters,
      MaxResults: 1,
    }),
  );
  if (!result.PriceList?.[0]) return 0;
  const terms = Object.values(JSON.parse(result.PriceList[0]).terms.OnDemand)[0]
    .priceDimensions;
  return Number(Object.values(terms)[0].pricePerUnit.USD);
}
async function ec2Pricing(credentials) {
  const instances = await ec2(credentials);
  return Promise.all(
    instances.map(async (instance) => {
      const hourlyPrice = await priceForInstance(
        credentials,
        instance.instanceType,
      );
      return {
        instanceId: instance.instanceId,
        instanceType: instance.instanceType,
        hourlyPrice,
        estimatedMonthlyCost: Number((hourlyPrice * 24 * 30).toFixed(2)),
        currency: "USD",
      };
    }),
  );
}
async function price(credentials, serviceCode, filters) {
  const result = await createAwsClients(credentials).pricing.send(
    new GetProductsCommand({
      ServiceCode: serviceCode,
      Filters: filters,
      MaxResults: 1,
    }),
  );
  if (!result.PriceList?.[0]) return 0;
  const dimensions = Object.values(
    Object.values(JSON.parse(result.PriceList[0]).terms.OnDemand)[0]
      .priceDimensions,
  );
  return Number(dimensions[0]?.pricePerUnit?.USD || 0);
}
async function s3Pricing(credentials) {
  const buckets = await s3(credentials);
  return Promise.all(
    buckets.map(async (bucket) => {
      const usage = await s3Metrics(credentials, bucket.bucketName);
      const pricePerGBMonth = await price(credentials, "AmazonS3", [
        { Type: "TERM_MATCH", Field: "productFamily", Value: "Storage" },
        { Type: "TERM_MATCH", Field: "volumeType", Value: "Standard" },
        { Type: "TERM_MATCH", Field: "regionCode", Value: credentials.region },
      ]);
      return {
        bucketName: bucket.bucketName,
        storageGB: usage.storageGB,
        pricePerGBMonth,
        estimatedMonthlyCost: Number(
          (usage.storageGB * pricePerGBMonth).toFixed(4),
        ),
        currency: "USD",
        breakdown: {
          storage: Number((usage.storageGB * pricePerGBMonth).toFixed(4)),
          requests: "Usage-dependent; not included",
        },
      };
    }),
  );
}
async function rdsPricing(credentials) {
  const databases = await rds(credentials);
  return Promise.all(
    databases.map(async (database) => {
      const detail = await rdsDetail(credentials, database.dbIdentifier);
      const hourlyPrice = await price(credentials, "AmazonRDS", [
        {
          Type: "TERM_MATCH",
          Field: "productFamily",
          Value: "Database Instance",
        },
        {
          Type: "TERM_MATCH",
          Field: "instanceType",
          Value: detail.instanceClass,
        },
        { Type: "TERM_MATCH", Field: "databaseEngine", Value: detail.engine },
        { Type: "TERM_MATCH", Field: "regionCode", Value: credentials.region },
      ]);
      return {
        dbIdentifier: detail.dbIdentifier,
        instanceClass: detail.instanceClass,
        engine: detail.engine,
        hourlyPrice,
        computeMonthlyCost: Number((hourlyPrice * 24 * 30).toFixed(2)),
        storageGB: detail.allocatedStorageGB,
        estimatedMonthlyCost: Number((hourlyPrice * 24 * 30).toFixed(2)),
        currency: "USD",
        breakdown: {
          compute: Number((hourlyPrice * 24 * 30).toFixed(2)),
          storage:
            "Storage, backup, and I/O depend on configuration and are not included",
        },
      };
    }),
  );
}
async function dashboard(credentials) {
  const [instances, buckets, databases, prices] = await Promise.all([
    ec2(credentials),
    s3(credentials),
    rds(credentials),
    ec2Pricing(credentials),
  ]);
  return {
    totalResources: instances.length + buckets.length + databases.length,
    totalEC2: instances.length,
    totalS3: buckets.length,
    totalRDS: databases.length,
    estimatedMonthlyCost: Number(
      prices
        .reduce((sum, item) => sum + item.estimatedMonthlyCost, 0)
        .toFixed(2),
    ),
  };
}
module.exports = {
  ec2,
  s3,
  rds,
  resources,
  ec2Metrics,
  s3Metrics,
  rdsMetrics,
  ec2Detail,
  s3Detail,
  rdsDetail,
  ec2Pricing,
  s3Pricing,
  rdsPricing,
  dashboard,
};
