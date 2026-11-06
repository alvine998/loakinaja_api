const { Op } = require('sequelize');
const { EscrowAccount, EscrowSale, Listing, SellerBalance, User } = require('../models');
const sequelize = require('../config/database');

async function createSale(req, res, next) {
  try {
    const result = await sequelize.transaction(async (transaction) => {
      const listing = await Listing.findByPk(req.body?.listingId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!listing || listing.status !== 'active') return { status: 404, error: 'Listing is no longer available' };
      if (listing.userId === req.user.id) return { status: 400, error: 'You cannot buy your own listing' };
      const escrowAccount = await EscrowAccount.findOne({ where: { isActive: true }, transaction });
      if (!escrowAccount) return { status: 503, error: 'Rekening Bersama is not configured yet' };
      const openSale = await EscrowSale.findOne({
        where: { listingId: listing.id, status: { [Op.in]: ['awaiting_payment', 'payment_submitted', 'in_escrow', 'release_requested'] } },
        transaction,
      });
      if (openSale) return { status: 409, error: 'This listing already has an open Rekening Bersama transaction' };
      const buyer = await User.findByPk(req.user.id, { transaction });
      const seller = await User.findByPk(listing.userId, { transaction });
      const escrowSale = await EscrowSale.create({
        listingId: listing.id,
        listingTitle: listing.title,
        buyerId: req.user.id,
        buyerName: buyer?.name || 'Pembeli',
        sellerId: listing.userId,
        sellerName: seller?.name || 'Penjual',
        amount: listing.price,
        escrowBankName: escrowAccount.bankName,
        escrowAccountNumber: escrowAccount.accountNumber,
        escrowAccountHolder: escrowAccount.accountHolder,
        status: 'awaiting_payment',
      }, { transaction });
      return { sale: escrowSale, escrowAccount };
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    return res.status(201).json({ data: result.sale, escrowAccount: result.escrowAccount });
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
        { model: Listing, as: 'listing', attributes: ['id', 'title', 'images', 'price'], required: false },
        { model: User, as: 'buyer', attributes: ['id', 'name'], required: false },
        { model: User, as: 'seller', attributes: ['id', 'name'], required: false },
      ],
      order: [['createdAt', 'DESC']],
    });
    for (const sale of sales) {
      if (!sale.listingTitle && sale.listing?.title) sale.listingTitle = sale.listing.title;
      if (!sale.buyerName && sale.buyer?.name) sale.buyerName = sale.buyer.name;
      if (!sale.sellerName && sale.seller?.name) sale.sellerName = sale.seller.name;
    }
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
      if (sale.status !== 'in_escrow') return { status: 409, error: 'Admin must verify the escrow payment first' };
      await sale.update({ status: 'release_requested' }, { transaction });
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
    const result = await sequelize.transaction(async (transaction) => {
      const sale = await EscrowSale.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!sale) return { status: 404, error: 'Escrow sale not found' };
      if (sale.buyerId !== req.user.id) return { status: 403, error: 'Only the buyer can submit payment confirmation' };
      if (sale.status !== 'awaiting_payment') return { status: 409, error: 'This sale is not awaiting payment' };
      await sale.update({ status: 'payment_submitted', paidAt: new Date() }, { transaction });
      return { sale };
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    return res.json({ data: result.sale });
  } catch (error) {
    return next(error);
  }
}

async function processPayment(req, res, next) {
  try {
    const decision = req.body?.decision;
    if (decision === 'released' || decision === 'return_to_escrow') {
      const result = await sequelize.transaction(async (transaction) => {
        const sale = await EscrowSale.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!sale) return { status: 404, error: 'Escrow sale not found' };
        if (decision === 'released' && sale.status !== 'release_requested') return { status: 409, error: 'Buyer must confirm delivery before releasing the sale' };
        if (decision === 'released') {
          const [balance] = await SellerBalance.findOrCreate({ where: { userId: sale.sellerId }, defaults: { userId: sale.sellerId, availableAmount: 0 }, transaction, lock: transaction.LOCK.UPDATE });
          await balance.increment('availableAmount', { by: sale.amount, transaction });
        } else {
          if (sale.status !== 'release_requested') return { status: 409, error: 'Sale is not awaiting a release decision' };
          await sale.update({ status: 'in_escrow' }, { transaction });
          return { sale };
        }
        await sale.update({ status: 'released', releasedAt: new Date() }, { transaction });
        return { sale };
      });
      if (result.error) return res.status(result.status).json({ error: result.error });
      return res.json({ data: result.sale });
    }
    if (!['paid', 'cancelled'].includes(decision)) return res.status(400).json({ error: 'decision must be paid, released, return_to_escrow, or cancelled' });
    const result = await sequelize.transaction(async (transaction) => {
      const sale = await EscrowSale.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!sale) return { status: 404, error: 'Escrow sale not found' };
      if (!['awaiting_payment', 'payment_submitted'].includes(sale.status)) return { status: 409, error: 'Escrow sale is no longer awaiting payment confirmation' };
      if (decision === 'paid' && sale.status !== 'payment_submitted') return { status: 409, error: 'Buyer must submit transfer confirmation before admin verification' };
      await sale.update({ status: decision === 'paid' ? 'in_escrow' : 'cancelled', paidAt: decision === 'paid' ? (sale.paidAt || new Date()) : null }, { transaction });
      if (decision === 'paid') await Listing.update({ status: 'sold' }, { where: { id: sale.listingId, status: 'active' }, transaction });
      return { sale };
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    return res.json({ data: result.sale });
  } catch (error) {
    return next(error);
  }
}

module.exports = { createSale, getSale, listMySales, listAllSales, submitPayment, confirmDelivery, processPayment };
