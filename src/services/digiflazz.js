const { createHash, createHmac, timingSafeEqual } = require('node:crypto');
const { env } = require('../config/env');

function ensureConfigured() {
  if (!env.digiflazz.username || !env.digiflazz.apiKey) {
    const error = new Error('Digiflazz PPOB is not configured');
    error.status = 503;
    throw error;
  }
}

function signature(value) {
  return createHash('md5').update(`${env.digiflazz.username}${env.digiflazz.apiKey}${value}`).digest('hex');
}

function providerErrorMessage(payload, fallback) {
  const data = payload?.data;
  const message = typeof data?.message === 'string'
    ? data.message
    : typeof payload?.message === 'string' ? payload.message : '';
  const code = typeof data?.rc === 'string' ? data.rc : typeof payload?.rc === 'string' ? payload.rc : '';
  const details = [code, message].filter(Boolean).join(': ');
  return details ? `${fallback} (${details})` : fallback;
}

async function request(path, body) {
  ensureConfigured();
  let response;
  try {
    response = await fetch(`${env.digiflazz.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    const error = new Error('Could not connect to Digiflazz');
    error.status = 502;
    throw error;
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.data) {
    const error = new Error(providerErrorMessage(payload, 'Digiflazz could not process the request'));
    error.status = response.status === 429 ? 503 : 502;
    throw error;
  }
  return payload.data;
}

async function getPriceList(type) {
  const products = await request('/price-list', {
    cmd: type === 'postpaid' ? 'pasca' : 'prepaid',
    username: env.digiflazz.username,
    sign: signature('pricelist'),
  });

  if (!Array.isArray(products)) {
    const error = new Error(providerErrorMessage(products, 'Digiflazz returned an invalid price list'));
    error.status = 502;
    throw error;
  }

  return products;
}

async function inquiryPln(customerNo) {
  return request('/inquiry-pln', {
    username: env.digiflazz.username,
    customer_no: customerNo,
    sign: signature(customerNo),
  });
}

async function transaction({ productCode, customerNo, refId, command, maxPrice }) {
  return request('/transaction', {
    ...(command ? { commands: command } : {}),
    username: env.digiflazz.username,
    buyer_sku_code: productCode,
    customer_no: customerNo,
    ref_id: refId,
    sign: signature(refId),
    ...(maxPrice && !command ? { max_price: maxPrice } : {}),
    ...(env.digiflazz.testing ? { testing: true } : {}),
  });
}

function isValidWebhook(rawBody, header) {
  if (!env.digiflazz.webhookSecret || !header) return false;
  const expected = `sha1=${createHmac('sha1', env.digiflazz.webhookSecret).update(rawBody).digest('hex')}`;
  const receivedBuffer = Buffer.from(header);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

module.exports = { getPriceList, inquiryPln, transaction, isValidWebhook };
