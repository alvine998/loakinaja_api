const { env } = require('../config/env');

async function mayarRequest(path, options = {}) {
  if (!env.mayar.apiKey) {
    const error = new Error('Mayar payment is not configured');
    error.status = 503;
    throw error;
  }

  let response;
  try {
    response = await fetch(`${env.mayar.baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${env.mayar.apiKey}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    const error = new Error('Could not connect to Mayar');
    error.status = 502;
    throw error;
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || (payload?.statusCode && payload.statusCode >= 400)) {
    const error = new Error('Mayar could not process the payment request');
    error.status = response.status === 429 ? 503 : 502;
    throw error;
  }
  return payload;
}

async function createInvoice({ order, user, redirectUrl }) {
  return mayarRequest('/invoices/create', {
    method: 'POST',
    body: JSON.stringify({
      name: user.name,
      email: user.email,
      mobile: user.phone,
      description: `Pembelian ${order.tokens} token LoakinAja (${order.id})`,
      redirectUrl,
      expiredAt: order.expiresAt.toISOString(),
      items: [{
        quantity: order.tokens,
        rate: order.pricePerToken,
        description: `Token LoakinAja - ${order.packageLabel}`,
      }],
      extraData: { loakinajaOrderId: order.id },
    }),
  });
}

async function getTransaction(transactionId) {
  return mayarRequest(`/transactions/${encodeURIComponent(transactionId)}`);
}

module.exports = { createInvoice, getTransaction };
