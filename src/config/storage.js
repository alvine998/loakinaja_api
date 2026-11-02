const { S3Client } = require('@aws-sdk/client-s3');
const { env } = require('./env');

const isConfigured = Boolean(
  env.r2.accountId &&
    env.r2.accessKeyId &&
    env.r2.secretAccessKey &&
    env.r2.bucketName &&
    env.r2.publicBaseUrl,
);

const r2 = isConfigured
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${env.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.r2.accessKeyId,
        secretAccessKey: env.r2.secretAccessKey,
      },
    })
  : null;

module.exports = { isConfigured, r2 };
