const crypto = require('crypto');
const { Op } = require('sequelize');
const { User, Withdrawal, SellerBalance, WithdrawalOtp } = require('../models');
const sequelize = require('../config/database');
const { sendWithdrawalOtp: deliverWithdrawalOtp } = require('../services/email');

const MINIMUM_WITHDRAWAL = 10000;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function withdrawalDetails(body = {}) {
  return {
    amount: Number(body.amount),
    bankName: typeof body.bankName === 'string' ? body.bankName.trim() : '',
    accountNumber: typeof body.accountNumber === 'string' ? body.accountNumber.trim() : '',
    accountHolder: typeof body.accountHolder === 'string' ? body.accountHolder.trim() : '',
  };
}

function hashOtp(userId, code) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${userId}:${code}`).digest('hex');
}

function hashRequest(userId, details) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${userId}:${JSON.stringify(details)}`).digest('hex');
}

function safeEqual(left, right) {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function sendWithdrawalOtp(req, res, next) {
  let otpRecord;
  try {
    const details = withdrawalDetails(req.body);
    if (!Number.isSafeInteger(details.amount) || details.amount < MINIMUM_WITHDRAWAL) return res.status(400).json({ error: `Minimum withdrawal is Rp ${MINIMUM_WITHDRAWAL.toLocaleString('id-ID')}` });
    if (!details.bankName || details.bankName.length > 80 || !details.accountNumber || details.accountNumber.length > 64 || !details.accountHolder || details.accountHolder.length > 120) {
      return res.status(400).json({ error: 'Valid bank name, account number, and account holder are required' });
    }

    const recentOtps = await WithdrawalOtp.count({
      where: { userId: req.user.id, createdAt: { [Op.gte]: new Date(Date.now() - 15 * 60 * 1000) } },
    });
    if (recentOtps >= 5) return res.status(429).json({ error: 'Terlalu banyak permintaan kode. Coba lagi dalam 15 menit.' });
    const balance = await SellerBalance.findByPk(req.user.id);
    if (!balance || Number(balance.availableAmount) < details.amount) return res.status(400).json({ error: 'Insufficient available balance' });

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    otpRecord = await WithdrawalOtp.create({
      userId: req.user.id,
      codeHash: hashOtp(req.user.id, code),
      requestHash: hashRequest(req.user.id, details),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });
    await deliverWithdrawalOtp(req.user.email, code);
    return res.json({ message: `Kode OTP telah dikirim ke ${req.user.email}` });
  } catch (error) {
    if (otpRecord) await otpRecord.destroy().catch(() => undefined);
    if (error.status) return res.status(error.status).json({ error: error.message });
    return next(error);
  }
}

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
    const { amount, bankName, accountNumber, accountHolder } = withdrawalDetails(req.body);
    const code = typeof req.body?.otp === 'string' ? req.body.otp.trim() : '';
    if (!Number.isSafeInteger(amount) || amount < MINIMUM_WITHDRAWAL) return res.status(400).json({ error: `Minimum withdrawal is Rp ${MINIMUM_WITHDRAWAL.toLocaleString('id-ID')}` });
    if (!bankName || bankName.length > 80 || !accountNumber || accountNumber.length > 64 || !accountHolder || accountHolder.length > 120) {
      return res.status(400).json({ error: 'Valid bank name, account number, and account holder are required' });
    }
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Masukkan kode OTP 6 digit yang dikirim ke email Anda.' });
    const result = await sequelize.transaction(async (transaction) => {
    const otp = await WithdrawalOtp.findOne({
        where: { userId: req.user.id, usedAt: null },
        order: [['createdAt', 'DESC']],
        transaction,
        lock: transaction.LOCK.UPDATE,
    });
    if (!otp || otp.expiresAt <= new Date()) return { error: 'Kode OTP kedaluwarsa atau tidak ditemukan. Minta kode baru.', status: 400 };
    if (otp.attempts >= OTP_MAX_ATTEMPTS) return { error: 'Batas percobaan OTP tercapai. Minta kode baru.', status: 400 };
    if (!safeEqual(otp.requestHash, hashRequest(req.user.id, { amount, bankName, accountNumber, accountHolder }))) {
        return { error: 'Detail penarikan berubah. Minta kode OTP baru.', status: 400 };
    }
    if (!safeEqual(otp.codeHash, hashOtp(req.user.id, code))) {
        await otp.increment('attempts', { transaction });
        return { error: 'Kode OTP salah. Periksa kembali email Anda.', status: 400 };
    }
      const balance = await SellerBalance.findByPk(req.user.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!balance || Number(balance.availableAmount) < amount) return { error: 'Insufficient available balance', status: 400 };
      await otp.update({ usedAt: new Date() }, { transaction });
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
    const data = await Withdrawal.findAll({
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
      order: [['createdAt', 'DESC']],
    });
    return res.json({ data });
  } catch (error) {
    return next(error);
  }
}

async function listAllBalances(req, res, next) {
  try {
    const balances = await SellerBalance.findAll({
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'] }],
      order: [['availableAmount', 'DESC']],
    });
    return res.json({ data: balances });
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

module.exports = { getBalance, sendWithdrawalOtp, requestWithdrawal, listAllWithdrawals, listAllBalances, processWithdrawal };
