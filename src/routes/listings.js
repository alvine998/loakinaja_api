const express = require('express');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { Listing, User } = require('../models');
const { requireAuth } = require('../middleware/auth');
const { imageUpload } = require('../middleware/upload');
const { uploadImage } = require('../services/imageStorage');

const router = express.Router();

router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const listings = await Listing.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
    });
    return res.json({ data: listings });
  } catch (error) {
    return next(error);
  }
});

router.get('/', async (req, res, next) => {
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
});

router.get('/:id', async (req, res, next) => {
  try {
    const listing = await Listing.findOne({
      where: { id: req.params.id, status: 'active' },
      include: [{ model: User, as: 'seller', attributes: ['id', 'name', 'createdAt'] }],
    });
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    return res.json({ data: listing });
  } catch (error) {
    return next(error);
  }
});

router.post('/', requireAuth, imageUpload.array('images', 5), async (req, res, next) => {
  try {
    const { title, category, price, condition, description, location } = req.body || {};
    if (![title, category, condition, description, location].every((value) => typeof value === 'string' && value.trim())) {
      return res.status(400).json({ error: 'title, category, condition, description, and location are required' });
    }
    const numericPrice = Number(price);
    if (!Number.isSafeInteger(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ error: 'price must be a non-negative integer' });
    }

    const images = await Promise.all((req.files || []).map(uploadImage));
    const listing = await sequelize.transaction(async (transaction) => {
      const [updatedUsers] = await User.decrement('tokens', {
        by: 1,
        where: { id: req.user.id, tokens: { [Op.gt]: 0 } },
        transaction,
      });
      if (updatedUsers === 0) {
        const error = new Error('Not enough tokens to publish a listing');
        error.status = 403;
        throw error;
      }
      return Listing.create({
        userId: req.user.id,
        title: title.trim(),
        category: category.trim(),
        price: numericPrice,
        condition: condition.trim(),
        description: description.trim(),
        location: location.trim(),
        images,
      }, { transaction });
    });
    return res.status(201).json({ data: listing });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const listing = await Listing.findByPk(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.userId !== req.user.id) return res.status(403).json({ error: 'You cannot edit this listing' });

    const allowed = ['title', 'category', 'price', 'condition', 'description', 'location', 'status'];
    const updates = {};
    for (const field of allowed) if (req.body?.[field] !== undefined) updates[field] = req.body[field];
    if (updates.price !== undefined && (!Number.isSafeInteger(Number(updates.price)) || Number(updates.price) < 0)) {
      return res.status(400).json({ error: 'price must be a non-negative integer' });
    }
    if (updates.price !== undefined) updates.price = Number(updates.price);
    await listing.update(updates);
    return res.json({ data: listing });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const listing = await Listing.findByPk(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.userId !== req.user.id) return res.status(403).json({ error: 'You cannot delete this listing' });
    await listing.destroy();
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
