const { randomUUID } = require('node:crypto');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { env } = require('../config/env');
const { isConfigured, r2 } = require('../config/storage');

const extensionByType = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

async function uploadImage(file, folder = 'listings') {
  if (!isConfigured) {
    const error = new Error('Image storage is not configured');
    error.status = 503;
    throw error;
  }

  const key = `${folder}/${randomUUID()}.${extensionByType[file.mimetype]}`;
  await r2.send(new PutObjectCommand({
    Bucket: env.r2.bucketName,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
  }));

  return `${env.r2.publicBaseUrl.replace(/\/$/, '')}/${key}`;
}

module.exports = { uploadImage };
