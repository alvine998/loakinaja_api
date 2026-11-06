const dotenv = require('dotenv');

dotenv.config();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  webOrigin: process.env.WEB_ORIGIN || 'http://localhost:3000',
  apiPublicUrl: (process.env.API_PUBLIC_URL || `http://localhost:${Number(process.env.PORT) || 4000}`).replace(/\/$/, ''),
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
  database: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    name: process.env.DB_NAME || 'loakinaja',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    logging: process.env.DB_LOG_SQL === 'true',
  },
  redis: {
    url: process.env.REDIS_URL,
  },
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  mayar: {
    apiKey: process.env.MAYAR_API_KEY,
    baseUrl: (process.env.MAYAR_BASE_URL || 'https://api.mayar.id/hl/v2').replace(/\/$/, ''),
  },
  digiflazz: {
    username: process.env.DIGIFLAZZ_USERNAME,
    apiKey: process.env.DIGIFLAZZ_API_KEY,
    baseUrl: (process.env.DIGIFLAZZ_BASE_URL || 'https://api.digiflazz.com/v1').replace(/\/$/, ''),
    webhookSecret: process.env.DIGIFLAZZ_WEBHOOK_SECRET,
    testing: process.env.DIGIFLAZZ_TESTING === 'true',
    markup: Number(process.env.PPOB_MARKUP_RUPIAH) || 1000,
    minRequestIntervalMs: Number(process.env.DIGIFLAZZ_MIN_REQUEST_INTERVAL_MS) || 1000,
  },
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
}

module.exports = { env, validateEnv };
