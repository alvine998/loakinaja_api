const { Withdrawal, SellerBalance } = require('../models');
const sequelize = require('../config/database');

const MINIMUM_WITHDRAWAL = 10000;

async function getBalance(req, res, next) {
  try {
    const balance = await SellerBalance.findByPk(req.user.id);
    const withdrawals = await Withdrawal.findAll({ where: { userId: req.user.id }, order: [['createdAt', 'DESC']] });
    return res.json({ availableAmount: Number(balance?.availableAmount || 0), minimumAmount: MINIMUM_WITHDRAWAL, data: withdrawals });
  } catch (error) {
    return next(error);
  }
}

async function requestWithdrawal(req, res, next) {
  try {
    const amount = Number(req.body?.amount);
    const bankName = typeof req.body?.bankName === 'string' ? req.body.bankName.trim() : '';
    const accountNumber = typeof req.body?.accountNumber === 'string' ? req.body.accountNumber.trim() : '';
    const accountHolder = typeof req.body?.accountHolder === 'string' ? req.body.accountHolder.trim() : '';
    if (!Number.isSafeInteger(amount) || amount < MINIMUM_WITHDRAWAL) return res.status(400).json({ error: `Minimum withdrawal is Rp ${MINIMUM_WITHDRAWAL.toLocaleString('id-ID')}` });
    if (!bankName || bankName.length > 80 || !accountNumber || accountNumber.length > 64 || !accountHolder || accountHolder.length > 120) {
      return res.status(400).json({ error: 'Valid bank name, account number, and account holder are required' });
    }
    const result = await sequelize.transaction(async (transaction) => {
      const balance = await SellerBalance.findByPk(req.user.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!balance || Number(balance.availableAmount) < amount) return { error: 'Insufficient available balance', status: 400 };
      await balance.decrement('availableAmount', { by: amount, transaction });
      const withdrawal = await Withdrawal.create({ userId: req.user.id, amount, bankName, accountNumber, accountHolder, status: 'pending' }, { transaction });
      return { withdrawal };
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    return res.status(201).json({ data: result.withdrawal });
  } catch (error) {
    return next(error);
  }
}

async function listAllWithdrawals(req, res, next) {
  try {
    const data = await Withdrawal.findAll({ order: [['createdAt', 'DESC']] });
    return res.json({ data });
  } catch (error) {
    return next(error);
  }
}

async function processWithdrawal(req, res, next) {
  try {
    const decision = req.body?.decision;
    if (!['paid', 'rejected'].includes(decision)) return res.status(400).json({ error: 'decision must be paid or rejected' });
    const result = await sequelize.transaction(async (transaction) => {
      const withdrawal = await Withdrawal.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!withdrawal) return { error: 'Withdrawal not found', status: 404 };
      if (withdrawal.status !== 'pending') return { error: 'Withdrawal has already been processed', status: 409 };
      if (decision === 'rejected') {
        const [balance] = await SellerBalance.findOrCreate({ where: { userId: withdrawal.userId }, defaults: { userId: withdrawal.userId, availableAmount: 0 }, transaction, lock: transaction.LOCK.UPDATE });
        await balance.increment('availableAmount', { by: withdrawal.amount, transaction });
      }
      await withdrawal.update({ status: decision, processedAt: new Date(), adminNote: typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 500) : null }, { transaction });
      return { withdrawal };
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    return res.json({ data: result.withdrawal });
  } catch (error) {
    return next(error);
  }
}

module.exports = { getBalance, requestWithdrawal, listAllWithdrawals, processWithdrawal };
