const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { Category, Listing, User } = require('../models');
const { uploadImage } = require('../services/imageStorage');

async function getMyListings(req, res, next) {
  try {
    const listings = await Listing.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
    });
    return res.json({ data: listings });
  } catch (error) {
    return next(error);
  }
}

async function getListings(req, res, next) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const where = { status: 'active' };
    if (typeof req.query.category === 'string' && req.query.category.trim()) where.category = req.query.category.trim();
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      where.title = { [Op.like]: `%${req.query.q.trim()}%` };
    }
    const result = await Listing.findAndCountAll({
      where,
      include: [{ model: User, as: 'seller', attributes: ['id', 'name', 'createdAt'] }],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });
    return res.json({ data: result.rows, pagination: { page, limit, total: result.count } });
  } catch (error) {
    return next(error);
  }
}

async function getListing(req, res, next) {
  try {
    const listing = await Listing.findOne({
      where: { id: req.params.id, status: ['active', 'sold'] },
      include: [{ model: User, as: 'seller', attributes: ['id', 'name', 'createdAt'] }],
    });
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    return res.json({ data: listing });
  } catch (error) {
    return next(error);
  }
}

async function createListing(req, res, next) {
  try {
    const { title, category, price, condition, description, location } = req.body || {};
    if (![title, category, condition, description, location].every((value) => typeof value === 'string' && value.trim())) {
      return res.status(400).json({ error: 'title, category, condition, description, and location are required' });
    }
    if (!await Category.findOne({ where: { name: category.trim() } })) {
      return res.status(400).json({ error: 'category must be an active product category' });
    }
    const numericPrice = Number(price);
    if (!Number.isSafeInteger(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ error: 'price must be a non-negative integer' });
    }

    const images = await Promise.all((req.files || []).map(uploadImage));
    const listing = await sequelize.transaction(async (transaction) => {
      const user = await User.findByPk(req.user.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!user || user.tokens < 1) {
        const error = new Error('Not enough tokens to publish a listing');
        error.status = 403;
        throw error;
      }
      await user.decrement('tokens', { by: 1, transaction });
      return Listing.create({
        userId: req.user.id,
        title: title.trim(),
        category: category.trim(),
        price: numericPrice,
        condition: condition.trim(),
        description: description.trim(),
        location: location.trim(),
        images,
        status: 'pending',
      }, { transaction });
    });
    return res.status(201).json({ data: listing });
  } catch (error) {
    return next(error);
  }
}

async function updateListing(req, res, next) {
  try {
    const listing = await Listing.findByPk(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.userId !== req.user.id) return res.status(403).json({ error: 'You cannot edit this listing' });

    const allowed = ['title', 'category', 'price', 'condition', 'description', 'location', 'status'];
    const updates = {};
    for (const field of allowed) if (req.body?.[field] !== undefined) updates[field] = req.body[field];
    if (updates.category !== undefined) {
      if (typeof updates.category !== 'string' || !await Category.findOne({ where: { name: updates.category.trim() } })) {
        return res.status(400).json({ error: 'category must be an active product category' });
      }
      updates.category = updates.category.trim();
    }
    if (updates.status !== undefined && updates.status !== 'sold') {
      return res.status(400).json({ error: 'Only active listings can be marked sold by the owner' });
    }
    if (updates.status === 'sold' && listing.status !== 'active') {
      return res.status(409).json({ error: 'Only approved active listings can be marked sold' });
    }
    if (updates.status === 'active' && listing.status !== 'sold') {
      return res.status(409).json({ error: 'Only sold listings can be reactivated by the owner' });
    }
    if (updates.price !== undefined && (!Number.isSafeInteger(Number(updates.price)) || Number(updates.price) < 0)) {
      return res.status(400).json({ error: 'price must be a non-negative integer' });
    }
    if (updates.price !== undefined) updates.price = Number(updates.price);
    await listing.update(updates);
    return res.json({ data: listing });
  } catch (error) {
    return next(error);
  }
}

async function deleteListing(req, res, next) {
  try {
    const listing = await Listing.findByPk(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.userId !== req.user.id) return res.status(403).json({ error: 'You cannot delete this listing' });
    await listing.destroy();
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getMyListings,
  getListings,
  getListing,
  createListing,
  updateListing,
  deleteListing,
};
