const sequelize = require('../config/database');
const { env } = require('../config/env');
const { TokenOrder, User } = require('../models');
const mayar = require('../services/mayar');

const PRICE_PER_TOKEN = 1000;
const PACKAGES = {
  starter: { tokens: 5, label: 'Starter' },
  popular: { tokens: 10, label: 'Populer' },
  pro: { tokens: 20, label: 'Pro' },
};
const ORDER_TTL_MS = 15 * 60 * 1000;

function serializeOrder(order) {
  return {
    id: order.id,
    packageId: order.packageId,
    packageLabel: order.packageLabel,
    tokens: order.tokens,
    pricePerToken: order.pricePerToken,
    amount: order.amount,
    status: order.status,
    paymentUrl: order.paymentUrl,
    expiresAt: order.expiresAt,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
  };
}

async function settlePaidOrder(orderId, transaction) {
  const order = await TokenOrder.findByPk(orderId, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!order || order.status === 'paid') return order;
  if (!['pending', 'expired'].includes(order.status)) return order;

  const user = await User.findByPk(order.userId, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!user) throw new Error('Token order owner not found');
  await user.increment('tokens', { by: order.tokens, transaction });
  await order.update({ status: 'paid', paidAt: new Date() }, { transaction });
  return order;
}

async function verifyMayarTransaction(order) {
  if (!order.mayarTransactionId) return order;
  const result = await mayar.getTransaction(order.mayarTransactionId);
  const transaction = result?.data;
  if (!transaction || transaction.id !== order.mayarTransactionId) return order;
  if (Number(transaction.amount) !== order.amount) {
    console.error(`Mayar amount mismatch for token order ${order.id}`);
    return order;
  }

  const status = String(transaction.status || '').toLowerCase();
  if (status === 'paid') {
    return sequelize.transaction((dbTransaction) => settlePaidOrder(order.id, dbTransaction));
  }
  if (status === 'expired' && order.status === 'pending') {
    await order.update({ status: 'expired' });
  }
  return order;
}

async function create(req, res, next) {
  let order;
  try {
    const pkg = PACKAGES[req.body?.packageId];
    if (!pkg) return res.status(400).json({ error: 'Invalid token package' });

    const expiresAt = new Date(Date.now() + ORDER_TTL_MS);
    order = await TokenOrder.create({
      userId: req.user.id,
      packageId: req.body.packageId,
      packageLabel: pkg.label,
      tokens: pkg.tokens,
      pricePerToken: PRICE_PER_TOKEN,
      amount: pkg.tokens * PRICE_PER_TOKEN,
      expiresAt,
    });
    const origin = (env.webOrigin || `${req.protocol}://${req.get('host')}`).split(',')[0].trim();
    const redirectUrl = `${origin}/payment/return?order=${encodeURIComponent(order.id)}`;
    const invoiceResponse = await mayar.createInvoice({ order, user: req.user, redirectUrl });
    const invoice = invoiceResponse?.data;
    if (!invoice?.link || !invoice?.transactionId || !invoice?.id) {
      throw Object.assign(new Error('Mayar returned an incomplete invoice response'), { status: 502 });
    }

    await order.update({
      mayarInvoiceId: invoice.id,
      mayarTransactionId: invoice.transactionId,
      paymentUrl: invoice.link,
      ...(invoice.expiredAt ? { expiresAt: new Date(invoice.expiredAt) } : {}),
    });
    return res.status(201).json({ order: serializeOrder(order) });
  } catch (error) {
    if (order && !order.mayarTransactionId) {
      await order.update({ status: 'failed' }).catch(() => {});
    }
    return next(error);
  }
}

async function getOne(req, res, next) {
  try {
    const order = await TokenOrder.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!order) return res.status(404).json({ error: 'Token order not found' });
    return res.json({ order: serializeOrder(order) });
  } catch (error) {
    return next(error);
  }
}

async function verify(req, res, next) {
  try {
    let order = await TokenOrder.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!order) return res.status(404).json({ error: 'Token order not found' });
    order = await verifyMayarTransaction(order);
    return res.json({ order: serializeOrder(order) });
  } catch (error) {
    return next(error);
  }
}

async function webhook(req, res, next) {
  try {
    const payload = req.body || {};
    const event = payload.event;
    const data = payload.data || {};
    const transactionId = data.transactionId || data.id;
    if (event !== 'payment.received' || !transactionId) {
      return res.status(200).json({ received: true, ignored: true });
    }

    const order = await TokenOrder.findOne({ where: { mayarTransactionId: transactionId } });
    if (!order) return res.status(200).json({ received: true, ignored: true });
    await verifyMayarTransaction(order);
    return res.status(200).json({ received: true });
  } catch (error) {
    return next(error);
  }
}

module.exports = { create, getOne, verify, webhook };
