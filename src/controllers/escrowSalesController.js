const { Op } = require('sequelize');
const { EscrowAccount, EscrowSale, Listing, SellerBalance, User } = require('../models');
const sequelize = require('../config/database');

async function createSale(req, res, next) {
  try {
    const listing = await Listing.findOne({ where: { id: req.body?.listingId, status: 'active' } });
    if (!listing) return res.status(404).json({ error: 'Listing is no longer available' });
    if (listing.userId === req.user.id) return res.status(400).json({ error: 'You cannot buy your own listing' });
    const escrowAccount = await EscrowAccount.findOne({ where: { isActive: true } });
    if (!escrowAccount) return res.status(503).json({ error: 'Rekening Bersama is not configured yet' });
    const sale = await EscrowSale.create({
      listingId: listing.id,
      buyerId: req.user.id,
      sellerId: listing.userId,
      amount: listing.price,
      escrowBankName: escrowAccount.bankName,
      escrowAccountNumber: escrowAccount.accountNumber,
      escrowAccountHolder: escrowAccount.accountHolder,
      status: 'awaiting_payment',
    });
    return res.status(201).json({ data: sale, escrowAccount });
  } catch (error) {
    return next(error);
  }
}

async function getSale(req, res, next) {
  try {
    const sale = await EscrowSale.findByPk(req.params.id, {
      include: [
        { model: Listing, as: 'listing', attributes: ['id', 'title', 'images', 'price'] },
        { model: User, as: 'buyer', attributes: ['id', 'name'] },
        { model: User, as: 'seller', attributes: ['id', 'name'] },
      ],
    });
    if (!sale) return res.status(404).json({ error: 'Escrow sale not found' });
    if (sale.buyerId !== req.user.id && sale.sellerId !== req.user.id) return res.status(403).json({ error: 'You cannot view this escrow sale' });
    return res.json({ data: sale });
  } catch (error) {
    return next(error);
  }
}

async function listAllSales(req, res, next) {
  try {
    const data = await EscrowSale.findAll({
      include: [
        { model: Listing, as: 'listing', attributes: ['id', 'title'] },
        { model: User, as: 'buyer', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'seller', attributes: ['id', 'name', 'email'] },
      ],
      order: [['createdAt', 'DESC']],
    });
    return res.json({ data });
  } catch (error) {
    return next(error);
  }
}

async function listMySales(req, res, next) {
  try {
    const sales = await EscrowSale.findAll({
      where: { [Op.or]: [{ buyerId: req.user.id }, { sellerId: req.user.id }] },
      include: [
        { model: Listing, as: 'listing', attributes: ['id', 'title', 'images', 'price'] },
        { model: User, as: 'buyer', attributes: ['id', 'name'] },
        { model: User, as: 'seller', attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
    });
    return res.json({ data: sales });
  } catch (error) {
    return next(error);
  }
}

async function confirmDelivery(req, res, next) {
  try {
    const result = await sequelize.transaction(async (transaction) => {
      const sale = await EscrowSale.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!sale) return { status: 404, error: 'Escrow sale not found' };
      if (sale.buyerId !== req.user.id) return { status: 403, error: 'Only the buyer can confirm delivery' };
      if (sale.status !== 'in_escrow') return { status: 409, error: 'The payment must be confirmed before delivery can be completed' };
      const [balance] = await SellerBalance.findOrCreate({
        where: { userId: sale.sellerId },
        defaults: { userId: sale.sellerId, availableAmount: 0 },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      await balance.increment('availableAmount', { by: sale.amount, transaction });
      await sale.update({ status: 'released', releasedAt: new Date() }, { transaction });
      return { sale };
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    return res.json({ data: result.sale });
  } catch (error) {
    return next(error);
  }
}

async function submitPayment(req, res, next) {
  try {
    const sale = await EscrowSale.findByPk(req.params.id);
    if (!sale) return res.status(404).json({ error: 'Escrow sale not found' });
    if (sale.buyerId !== req.user.id) return res.status(403).json({ error: 'Only the buyer can submit payment confirmation' });
    if (sale.status !== 'awaiting_payment') return res.status(409).json({ error: 'This sale is not awaiting payment' });
    await sale.update({ status: 'payment_submitted', paidAt: new Date() });
    return res.json({ data: sale });
  } catch (error) {
    return next(error);
  }
}

async function processPayment(req, res, next) {
  try {
    const decision = req.body?.decision;
    if (!['paid', 'cancelled'].includes(decision)) return res.status(400).json({ error: 'decision must be paid or cancelled' });
    const sale = await EscrowSale.findByPk(req.params.id);
    if (!sale) return res.status(404).json({ error: 'Escrow sale not found' });
    if (!['awaiting_payment', 'payment_submitted'].includes(sale.status)) return res.status(409).json({ error: 'Escrow sale is no longer awaiting payment confirmation' });
    if (decision === 'paid' && sale.status !== 'payment_submitted') return res.status(409).json({ error: 'Buyer must submit transfer confirmation before admin verification' });
    await sale.update({ status: decision === 'paid' ? 'in_escrow' : 'cancelled', paidAt: decision === 'paid' ? (sale.paidAt || new Date()) : null });
    return res.json({ data: sale });
  } catch (error) {
    return next(error);
  }
}

module.exports = { createSale, getSale, listMySales, listAllSales, submitPayment, confirmDelivery, processPayment };
