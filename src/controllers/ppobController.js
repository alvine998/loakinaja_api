const { createHash, randomBytes, randomUUID, timingSafeEqual } = require('node:crypto');
const sequelize = require('../config/database');
const { env } = require('../config/env');
const { PpobOrder } = require('../models');
const digiflazz = require('../services/digiflazz');
const mayar = require('../services/mayar');

const priceCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getCachedProducts(type) {
  const now = Date.now();
  let products = priceCache.get(type);
  if (!products || products.expiresAt <= now) {
    const response = await digiflazz.getPriceList(type);
    products = {
      expiresAt: now + CACHE_TTL_MS,
      data: response.map((item) => publicProduct(item, type)),
    };
    priceCache.set(type, products);
  }
  return products;
}

function publicProduct(product, type) {
  const providerPrice = Number(product.price || 0);
  const fee = Number(product.admin || 0);
  const markup = Math.max(0, env.digiflazz.markup);
  return {
    code: product.buyer_sku_code,
    name: product.product_name,
    category: product.category || (type === 'postpaid' ? 'Pascabayar' : ''),
    brand: product.brand || '',
    type,
    description: product.desc || '',
    price: providerPrice + fee + markup,
    providerPrice,
    admin: fee,
    available: product.buyer_product_status === true && product.seller_product_status === true,
    unlimitedStock: product.unlimited_stock === true,
    stock: Number(product.stock || 0),
  };
}

function customerQuoteData(order) {
  if (!order.quoteData || typeof order.quoteData !== 'object') return null;
  const quote = { ...order.quoteData };
  for (const field of ['buyer_last_saldo', 'price', 'selling_price', 'sn', 'tele', 'wa']) delete quote[field];
  return quote;
}

function serializeOrder(order) {
  return {
    id: order.id,
    type: order.type,
    productCode: order.productCode,
    productName: order.productName,
    category: order.category,
    brand: order.brand,
    customerNo: order.customerNo,
    refId: order.refId,
    status: order.status,
    providerStatus: order.providerStatus,
    responseCode: order.responseCode,
    message: order.message,
    serialNumber: order.serialNumber,
    providerPrice: order.providerPrice,
    amount: order.amount,
    quoteData: customerQuoteData(order),
    quoteExpiresAt: order.quoteExpiresAt,
    paymentUrl: order.paymentUrl,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    completedAt: order.completedAt,
  };
}

function statusFromDigiflazz(value) {
  const status = String(value || '').toLowerCase();
  if (status === 'sukses' || status === 'success') return 'success';
  if (status === 'pending') return 'pending';
  if (status === 'gagal' || status === 'failed') return 'failed';
  return 'processing';
}

function newRefId() {
  return `LK${Date.now().toString(36)}${randomUUID().replace(/-/g, '').slice(0, 12)}`.slice(0, 40);
}

function hashGuestToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function isValidEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function hasOrderAccess(order, req) {
  if (order.userId) return req.user?.id === order.userId;
  const token = req.get('x-guest-order-token') || req.body?.guestToken;
  if (typeof token !== 'string' || token.length < 32 || !order.guestAccessTokenHash) return false;
  const provided = Buffer.from(hashGuestToken(token), 'hex');
  const expected = Buffer.from(order.guestAccessTokenHash, 'hex');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function getProducts(req, res, next) {
  try {
    const type = req.query.type === 'postpaid' ? 'postpaid' : 'prepaid';
    const products = await getCachedProducts(type);

    const category = typeof req.query.category === 'string' ? req.query.category.toLowerCase() : '';
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const data = products.data.filter((item) => item.available
      && (!category || item.category.toLowerCase() === category)
      && (!search || `${item.name} ${item.category} ${item.brand} ${item.code}`.toLowerCase().includes(search)))
      .map(({ code, name, category: productCategory, brand, type: productType, description, price, available, stock, unlimitedStock }) => ({
        code, name, category: productCategory, brand, type: productType, description, price, available, stock, unlimitedStock,
      }));
    return res.json({ data, categories: [...new Set(products.data.map((item) => item.category).filter(Boolean))] });
  } catch (error) {
    return next(error);
  }
}

async function createQuote(req, res, next) {
  try {
    const { type, productCode, customerNo, buyerName, buyerEmail, buyerPhone } = req.body || {};
    if (!['prepaid', 'postpaid'].includes(type) || typeof productCode !== 'string' || typeof customerNo !== 'string' || !customerNo.trim() || customerNo.trim().length > 180) {
      return res.status(400).json({ error: 'type, productCode, and customerNo are required' });
    }
    if (!req.user && (typeof buyerName !== 'string' || !buyerName.trim() || buyerName.trim().length > 120 || !isValidEmail(buyerEmail)
      || typeof buyerPhone !== 'string' || buyerPhone.trim().length < 8 || buyerPhone.trim().length > 32)) {
      return res.status(400).json({ error: 'A valid name, email, and phone number are required for guest checkout' });
    }

    const cache = await getCachedProducts(type);
    const product = cache.data.find((item) => item.code === productCode && item.available);
    if (!product) return res.status(400).json({ error: 'Product is not available' });

    const refId = newRefId();
    let quoteData = null;
    let providerPrice = product.providerPrice;
    let admin = product.admin;
    let customerAmount = product.providerPrice + admin;
    if (type === 'prepaid' && product.category.toLowerCase().includes('pln')
      && product.name.toLowerCase().includes('token')) {
      const validation = await digiflazz.inquiryPln(customerNo.trim());
      if (statusFromDigiflazz(validation.status) !== 'success') {
        const error = new Error(validation.message || 'Nomor meter PLN tidak dapat diverifikasi');
        error.status = 422;
        error.details = { responseCode: validation.rc };
        throw error;
      }
      quoteData = validation;
    }
    if (type === 'postpaid') {
      const inquiry = await digiflazz.transaction({
        command: 'inq-pasca', productCode, customerNo: customerNo.trim(), refId,
      });
      const inquiryStatus = statusFromDigiflazz(inquiry.status);
      if (inquiryStatus !== 'success') {
        const error = new Error(inquiry.message || 'Tagihan tidak dapat diperiksa');
        error.status = 422;
        error.details = { responseCode: inquiry.rc, providerStatus: inquiry.status };
        throw error;
      }
      quoteData = inquiry;
      providerPrice = Number(inquiry.price || inquiry.selling_price || 0);
      customerAmount = Number(inquiry.selling_price || inquiry.price || 0);
      admin = 0;
    }

    if (!Number.isFinite(providerPrice) || providerPrice <= 0) {
      const error = new Error('Harga produk tidak valid');
      error.status = 502;
      throw error;
    }

    const guestToken = req.user ? null : randomBytes(32).toString('base64url');
    const order = await PpobOrder.create({
      userId: req.user?.id || null,
      type,
      productCode,
      productName: product.name,
      category: product.category,
      brand: product.brand,
      customerNo: customerNo.trim(),
      refId,
      status: 'quoted',
      providerPrice,
      amount: customerAmount + Math.max(0, env.digiflazz.markup),
      quoteData,
      quoteExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      guestAccessTokenHash: guestToken ? hashGuestToken(guestToken) : null,
      buyerName: req.user ? req.user.name : buyerName.trim(),
      buyerEmail: req.user ? req.user.email : buyerEmail.trim().toLowerCase(),
      buyerPhone: req.user ? req.user.phone : buyerPhone.trim(),
    });
    return res.status(201).json({ order: serializeOrder(order), ...(guestToken ? { guestToken } : {}) });
  } catch (error) {
    return next(error);
  }
}

async function startPayment(req, res, next) {
  let order;
  try {
    order = await PpobOrder.findByPk(req.params.id);
    if (!order || !hasOrderAccess(order, req)) return res.status(404).json({ error: 'PPOB order not found' });
    if (!['quoted', 'creating_payment'].includes(order.status)) return res.status(409).json({ error: 'This PPOB order is no longer payable' });
    if (order.status === 'creating_payment' && order.createdAt < new Date(Date.now() - 2 * 60 * 1000)) {
      return res.status(409).json({ error: 'Payment creation is still being reconciled. Please check the order status shortly.' });
    }
    if (order.quoteExpiresAt <= new Date()) {
      await order.update({ status: 'expired' });
      return res.status(409).json({ error: 'The quote has expired. Please check the product and bill again.' });
    }
    const ownerClause = order.userId ? { userId: order.userId } : { userId: null };
    if (order.status === 'quoted') {
      const [claimed] = await PpobOrder.update({ status: 'creating_payment' }, {
        where: { id: order.id, ...ownerClause, status: 'quoted' },
      });
      if (!claimed) return res.status(409).json({ error: 'This PPOB order is already being processed' });
      await order.reload();
    }

    const origin = (env.webOrigin || `${req.protocol}://${req.get('host')}`).split(',')[0].trim();
    const redirectUrl = `${origin}/ppob/return?order=${encodeURIComponent(order.id)}`;
    const invoiceResult = await mayar.createPpobInvoice({ order, user: req.user || null, redirectUrl });
    const invoice = invoiceResult?.data;
    if (!invoice?.id || !invoice?.transactionId || !invoice?.link) {
      const error = new Error('Mayar returned an incomplete invoice response');
      error.status = 502;
      throw error;
    }
    await order.update({
      status: 'awaiting_payment',
      mayarInvoiceId: invoice.id,
      mayarTransactionId: invoice.transactionId,
      paymentUrl: invoice.link,
    });
    return res.status(201).json({ order: serializeOrder(order) });
  } catch (error) {
    // Keep an invoice-creation attempt locked after an upstream error: the
    // provider may have created the invoice even if its response timed out.
    return next(error);
  }
}

async function executeProviderOrder(orderId) {
  const result = await sequelize.transaction(async (transaction) => {
    const order = await PpobOrder.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!order || !['awaiting_payment', 'pending'].includes(order.status) || !order.paidAt) return null;
    if (order.status === 'pending' && order.lastProviderCheckAt
      && Date.now() - order.lastProviderCheckAt.getTime() < 60000) return null;
    const isStatusCheck = order.status === 'pending';
    await order.update({ status: isStatusCheck ? 'pending' : 'processing', lastProviderCheckAt: new Date() }, { transaction });
    return { order, isStatusCheck };
  });
  if (!result) return PpobOrder.findByPk(orderId);

  try {
    const response = await digiflazz.transaction({
      productCode: result.order.productCode,
      customerNo: result.order.customerNo,
      refId: result.order.refId,
      command: result.order.type === 'postpaid'
        ? (result.isStatusCheck ? 'status-pasca' : 'pay-pasca')
        : undefined,
      maxPrice: result.order.providerPrice,
    });
    const status = statusFromDigiflazz(response.status);
    await result.order.update({
      status,
      providerStatus: response.status || null,
      responseCode: response.rc || null,
      message: response.message || null,
      serialNumber: response.sn || null,
      providerPrice: Number(response.price || result.order.providerPrice),
      completedAt: status === 'success' || status === 'failed' ? new Date() : null,
    });
    return result.order;
  } catch (error) {
    await result.order.update({ status: 'pending', message: 'Transaksi sedang diproses; status akan diperbarui melalui Digiflazz.' });
    throw error;
  }
}

async function verifyPayment(req, res, next) {
  try {
    let order = await PpobOrder.findByPk(req.params.id);
    if (!order || !hasOrderAccess(order, req)) return res.status(404).json({ error: 'PPOB order not found' });
    order = await verifyAndProcess(order);
    return res.json({ order: serializeOrder(order) });
  } catch (error) {
    return next(error);
  }
}

async function verifyAndProcess(order) {
  if (order.mayarTransactionId && !order.paidAt) {
    const result = await mayar.getTransaction(order.mayarTransactionId);
    const transaction = result?.data;
    if (transaction?.id === order.mayarTransactionId
      && Number(transaction.amount) === order.amount
      && String(transaction.status).toLowerCase() === 'paid') {
      const [claimed] = await PpobOrder.update({ paidAt: new Date() }, {
        where: { id: order.id, paidAt: null, status: 'awaiting_payment' },
      });
      if (claimed) order = await executeProviderOrder(order.id);
      else order = await PpobOrder.findByPk(order.id);
    }
  } else if (order.paidAt && ['awaiting_payment', 'pending'].includes(order.status)) {
      order = await executeProviderOrder(order.id);
  }
  return order;
}

async function getOrder(req, res, next) {
  try {
    const order = await PpobOrder.findByPk(req.params.id);
    if (!order || !hasOrderAccess(order, req)) return res.status(404).json({ error: 'PPOB order not found' });
    return res.json({ order: serializeOrder(order) });
  } catch (error) {
    return next(error);
  }
}

async function listOrders(req, res, next) {
  try {
    const orders = await PpobOrder.findAll({ where: { userId: req.user.id }, order: [['createdAt', 'DESC']], limit: 30 });
    return res.json({ data: orders.map(serializeOrder) });
  } catch (error) {
    return next(error);
  }
}

async function getGuestOrder(req, res, next) {
  try {
    const order = await PpobOrder.findByPk(req.params.id);
    if (!order || order.userId || !hasOrderAccess(order, req)) return res.status(404).json({ error: 'PPOB order not found' });
    const result = await verifyAndProcess(order);
    return res.json({ order: serializeOrder(result) });
  } catch (error) {
    return next(error);
  }
}

async function mayarWebhook(req, res, next) {
  try {
    const payload = req.body || {};
    const data = payload.data || {};
    if (payload.event !== 'payment.received') return res.status(200).json({ received: true, ignored: true });
    const order = await PpobOrder.findOne({ where: { mayarTransactionId: data.transactionId || data.id } });
    if (!order) return res.status(200).json({ received: true, ignored: true });
    try {
      await verifyAndProcess(order);
    } catch (error) {
      console.error(`Unable to process paid PPOB order ${order.id}:`, error.message);
      // Mayar should receive a 2xx for its delivery. Guest and signed-in
      // order-status requests can safely retry the idempotent processing path.
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    return next(error);
  }
}

async function digiflazzWebhook(req, res, next) {
  try {
    if (!digiflazz.isValidWebhook(req.rawBody || Buffer.alloc(0), req.get('x-hub-signature'))) {
      return res.status(401).json({ error: 'Invalid Digiflazz webhook signature' });
    }
    const data = req.body?.data || {};
    const refId = data.ref_id;
    if (!refId) return res.status(200).json({ received: true, ignored: true });
    const order = await PpobOrder.findOne({ where: { refId } });
    if (!order) return res.status(200).json({ received: true, ignored: true });
    if ((data.customer_no && data.customer_no !== order.customerNo)
      || (data.buyer_sku_code && data.buyer_sku_code !== order.productCode)) {
      return res.status(400).json({ error: 'Webhook does not match PPOB order' });
    }

    const status = statusFromDigiflazz(data.status);
    if (['success', 'failed'].includes(order.status) && order.status !== status) {
      return res.status(200).json({ received: true, ignored: true });
    }
    await order.update({
      status,
      providerStatus: data.status || null,
      responseCode: data.rc || null,
      message: data.message || null,
      serialNumber: data.sn || null,
      ...(status === 'success' || status === 'failed' ? { completedAt: new Date() } : {}),
    });
    return res.status(200).json({ received: true });
  } catch (error) {
    return next(error);
  }
}

module.exports = { getProducts, createQuote, startPayment, verifyPayment, getOrder, getGuestOrder, listOrders, mayarWebhook, digiflazzWebhook };
