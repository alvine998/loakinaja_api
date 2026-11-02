const dotenv = require('dotenv');

dotenv.config();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  webOrigin: process.env.WEB_ORIGIN || 'http://localhost:3000',
  database: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    name: process.env.DB_NAME || 'loakinaja',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    logging: process.env.DB_LOG_SQL === 'true',
  },
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  admin: {
    email: process.env.ADMIN_EMAIL?.trim().toLowerCase(),
    password: process.env.ADMIN_PASSWORD,
  },
  r2: {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucketName: process.env.R2_BUCKET_NAME,
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL,
  },
};

function validateEnv() {
  if (!env.jwtSecret || env.jwtSecret === 'replace-with-a-long-random-secret') {
    throw new Error('Set JWT_SECRET to a strong, unique secret in .env');
  }
  if (env.admin.password === 'replace-with-a-strong-admin-password') {
    throw new Error('Set ADMIN_PASSWORD to a strong, unique password in .env');
  }
}

module.exports = { env, validateEnv };
