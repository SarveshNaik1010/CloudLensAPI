const { EC2Client } = require("@aws-sdk/client-ec2");
const { S3Client } = require("@aws-sdk/client-s3");
const { RDSClient } = require("@aws-sdk/client-rds");
const { CloudWatchClient } = require("@aws-sdk/client-cloudwatch");
const { STSClient } = require("@aws-sdk/client-sts");
const { PricingClient } = require("@aws-sdk/client-pricing");

function awsConfig(credentials) {
  return {
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    },
  };
}

function createAwsClients(credentials) {
  const config = awsConfig(credentials);
  return {
    ec2: new EC2Client(config),
    s3: new S3Client(config),
    rds: new RDSClient(config),
    cloudWatch: new CloudWatchClient(config),
    sts: new STSClient(config),
    // AWS Pricing is only served from us-east-1 and ap-south-1.
    pricing: new PricingClient({ ...config, region: "us-east-1" }),
  };
}

module.exports = { createAwsClients };
