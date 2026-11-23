const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { env } = require('../config/env');
const { TokenOrder, User } = require('../models');
const ipaymu = require('../services/ipaymu');
const ppobController = require('./ppobController');

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

async function verifyIpaymuTransaction(order, candidateTransactionId = null) {
  const transactionId = order.ipaymuTransactionId || (candidateTransactionId ? String(candidateTransactionId).trim() : '');
  if (!transactionId) {
    if (order.status === 'pending' && order.expiresAt <= new Date()) {
      await order.update({ status: 'expired' });
    }
    return order;
  }

  const result = await ipaymu.getTransaction(transactionId);
  const transaction = result?.Data;
  if (!transaction) return order;
  if (transaction.ReferenceId && String(transaction.ReferenceId) !== String(order.id)) {
    console.error(`iPaymu reference mismatch for token order ${order.id}`);
    return order;
  }
  if (Number(transaction.Amount) !== order.amount) {
    console.error(`iPaymu amount mismatch for token order ${order.id}`);
    return order;
  }

  const resolvedTrxId = String(transaction.TransactionId || transactionId);
  if (!order.ipaymuTransactionId && resolvedTrxId) {
    await order.update({ ipaymuTransactionId: resolvedTrxId }).catch(() => {});
  }

  if (ipaymu.isTransactionPaid(transaction)) {
    return sequelize.transaction((dbTransaction) => settlePaidOrder(order.id, dbTransaction));
  }
  if (ipaymu.isTransactionExpired(transaction) && order.status === 'pending') {
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
    const returnUrl = `${origin}/payment/return?order=${encodeURIComponent(order.id)}`;
    const cancelUrl = `${origin}/payment/failed?order=${encodeURIComponent(order.id)}`;
    const notifyUrl = `${env.apiPublicUrl}/api/payments/ipaymu/webhook`;
    const paymentResponse = await ipaymu.createTokenPayment({
      order,
      user: req.user,
      returnUrl,
      cancelUrl,
      notifyUrl,
    });
    const data = paymentResponse?.Data;
    if (!data?.Url || !data?.SessionID) {
      throw Object.assign(new Error('iPaymu returned an incomplete payment response'), { status: 502 });
    }

    await order.update({
      ipaymuSessionId: String(data.SessionID),
      paymentUrl: data.Url,
    });
    return res.status(201).json({ order: serializeOrder(order) });
  } catch (error) {
    if (order && !order.ipaymuSessionId) {
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
    const candidateTrxId = req.body?.trx_id || req.body?.transactionId || req.query?.trx_id || null;
    order = await verifyIpaymuTransaction(order, candidateTrxId);
    return res.json({ order: serializeOrder(order) });
  } catch (error) {
    return next(error);
  }
}

async function webhook(req, res, next) {
  try {
    const payload = req.body || {};
    if (!ipaymu.isValidWebhook(payload, req.get('x-signature'))) {
      return res.status(401).json({ error: 'Invalid iPaymu webhook signature' });
    }

    const trxId = payload.trx_id ? String(payload.trx_id).trim() : '';
    const referenceId = payload.reference_id ? String(payload.reference_id).trim() : '';
    const sid = payload.sid ? String(payload.sid).trim() : '';
    if (!trxId && !referenceId && !sid) {
      return res.status(200).json({ received: true, ignored: true });
    }

    const lookupConditions = [];
    if (referenceId) lookupConditions.push({ id: referenceId });
    if (sid) lookupConditions.push({ ipaymuSessionId: sid });
    if (trxId) lookupConditions.push({ ipaymuTransactionId: trxId });

    const order = await TokenOrder.findOne({ where: { [Op.or]: lookupConditions } });
    if (!order) return ppobController.ipaymuWebhook(req, res, next);
    try {
      await verifyIpaymuTransaction(order, trxId);
    } catch (error) {
      console.error(`Unable to verify iPaymu token order ${order.id}:`, error.message);
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    return next(error);
  }
}

module.exports = { create, getOne, verify, webhook };
