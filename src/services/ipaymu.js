const { createHash, createHmac, timingSafeEqual } = require('node:crypto');
const { env } = require('../config/env');

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function createSignature(method, bodyString = '') {
  const bodyHash = createHash('sha256').update(bodyString).digest('hex').toLowerCase();
  const stringToSign = `${method.toUpperCase()}:${env.ipaymu.va}:${bodyHash}:${env.ipaymu.apiKey}`;
  return createHmac('sha256', env.ipaymu.apiKey).update(stringToSign).digest('hex').toLowerCase();
}

async function ipaymuRequest(path, options = {}) {
  if (!env.ipaymu.va || !env.ipaymu.apiKey) {
    const error = new Error('iPaymu payment is not configured');
    error.status = 503;
    throw error;
  }

  const method = (options.method || 'POST').toUpperCase();
  const bodyString = options.body
    ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body))
    : '';
  const signature = createSignature(method, bodyString);
  const timestamp = formatTimestamp();

  let response;
  try {
    response = await fetch(`${env.ipaymu.baseUrl}${path}`, {
      ...options,
      method,
      body: bodyString || undefined,
      headers: {
        'Content-Type': 'application/json',
        va: env.ipaymu.va,
        signature,
        timestamp,
        ...options.headers,
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    const error = new Error('Could not connect to iPaymu');
    error.status = 502;
    throw error;
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.Success === false || (payload?.Status && Number(payload.Status) >= 400)) {
    const error = new Error(payload?.Message || 'iPaymu could not process the payment request');
    error.status = response.status === 429 ? 503 : 502;
    throw error;
  }
  return payload;
}

function buildPaymentPayload({ product, qty, price, description, returnUrl, cancelUrl, notifyUrl, referenceId, customer }) {
  const payload = {
    product,
    qty,
    price,
    description,
    returnUrl,
    cancelUrl,
    notifyUrl,
    referenceId,
    expired: 15,
    expiredType: 'minutes',
  };
  if (customer?.name) payload.buyerName = customer.name;
  if (customer?.email) payload.buyerEmail = customer.email;
  if (customer?.phone) payload.buyerPhone = customer.phone;
  return payload;
}

async function createTokenPayment({ order, user, returnUrl, cancelUrl, notifyUrl }) {
  return ipaymuRequest('/payment', {
    method: 'POST',
    body: JSON.stringify(buildPaymentPayload({
      product: [`Token LoakinAja - ${order.packageLabel}`],
      qty: [order.tokens],
      price: [order.pricePerToken],
      description: [`Pembelian ${order.tokens} token LoakinAja (${order.id})`],
      returnUrl,
      cancelUrl,
      notifyUrl,
      referenceId: order.id,
      customer: user,
    })),
  });
}

async function createPpobPayment({ order, user, returnUrl, cancelUrl, notifyUrl }) {
  const customer = user || {
    name: order.buyerName,
    email: order.buyerEmail,
    phone: order.buyerPhone,
  };
  return ipaymuRequest('/payment', {
    method: 'POST',
    body: JSON.stringify(buildPaymentPayload({
      product: [order.productName],
      qty: [1],
      price: [order.amount],
      description: [`Pembayaran ${order.productName} (${order.refId})`],
      returnUrl,
      cancelUrl,
      notifyUrl,
      referenceId: order.id,
      customer,
    })),
  });
}

async function getTransaction(transactionId) {
  const numericId = Number(transactionId);
  return ipaymuRequest('/transaction', {
    method: 'POST',
    body: JSON.stringify({
      transactionId: Number.isFinite(numericId) && numericId > 0 ? numericId : transactionId,
    }),
  });
}

function isValidWebhook(body, receivedSignature) {
  if (!env.ipaymu.va || !receivedSignature || !body || typeof body !== 'object') {
    return false;
  }

  const sortedData = {};
  for (const key of Object.keys(body).sort((a, b) => a.localeCompare(b))) {
    sortedData[key] = body[key];
  }
  const stringPayload = JSON.stringify(sortedData);
  const expected = createHmac('sha256', env.ipaymu.va).update(stringPayload).digest('hex').toLowerCase();
  const received = String(receivedSignature).trim().toLowerCase();

  const receivedBuf = Buffer.from(received, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  return receivedBuf.length === expectedBuf.length && timingSafeEqual(receivedBuf, expectedBuf);
}

function isTransactionPaid(transaction) {
  if (!transaction) return false;
  const statusDesc = String(transaction.StatusDesc || transaction.status || '').toLowerCase();
  return Number(transaction.Status) === 1
    || Number(transaction.PaidStatus) === 1
    || Number(transaction.status_code) === 1
    || statusDesc === 'berhasil';
}

function isTransactionExpired(transaction) {
  if (!transaction) return false;
  const statusDesc = String(transaction.StatusDesc || transaction.status || '').toLowerCase();
  return [-2, -1, 2].includes(Number(transaction.Status))
    || ['expired', 'kadaluarsa', 'batal', 'cancelled', 'gagal', 'failed'].includes(statusDesc);
}

module.exports = {
  createTokenPayment,
  createPpobPayment,
  getTransaction,
  isValidWebhook,
  isTransactionPaid,
  isTransactionExpired,
};
