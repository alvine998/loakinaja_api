const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { timingSafeEqual } = require('node:crypto');
const { env } = require('../config/env');
const { Listing, User } = require('../models');
const { isConfigured: isR2Configured } = require('../config/storage');

async function login(req, res) {
  const { email, password } = req.body || {};
  if (typeof env.admin.email !== 'string' || typeof env.admin.password !== 'string') {
    return res.status(503).json({ error: 'Admin login is not configured on this server' });
  }
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const safeEqual = (left, right) => {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  };
  const emailMatches = safeEqual(email.trim().toLowerCase(), env.admin.email);
  const passwordMatches = env.admin.password.startsWith('$2')
    ? await bcrypt.compare(password, env.admin.password).catch(() => false)
    : safeEqual(password, env.admin.password);
  if (!emailMatches || !passwordMatches) {
    return res.status(401).json({ error: 'Invalid admin email or password' });
  }

  if (!env.jwtSecret) return res.status(503).json({ error: 'Admin authentication is not configured' });

  const token = jwt.sign(
    { role: 'admin', email: env.admin.email },
    env.jwtSecret,
    { expiresIn: '8h' },
  );
  return res.json({ token, admin: { email: env.admin.email, role: 'admin' } });
}

async function getSession(req, res) {
  return res.json({ authenticated: true, admin: req.admin });
}

async function getDashboard(req, res, next) {
  try {
    const [users, listings] = await Promise.all([
      User.findAll({ order: [['createdAt', 'DESC']] }),
      Listing.findAll({
        include: [{ model: User, as: 'seller', attributes: ['id', 'name', 'email', 'phone'] }],
        order: [['createdAt', 'DESC']],
      }),
    ]);
    return res.json({ data: { users, listings, orders: [] }, capabilities: { payments: false, imageStorage: isR2Configured } });
  } catch (error) {
    return next(error);
  }
}

async function reviewListing(req, res, next) {
  try {
    const { decision, reason } = req.body || {};
    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be approve or reject' });
    }
    const listing = await Listing.findByPk(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.status !== 'pending') {
      return res.status(409).json({ error: 'Only pending listings can be reviewed' });
    }

    const updates = {
      status: decision === 'approve' ? 'active' : 'rejected',
    };
    if (decision === 'reject') updates.reviewReason = typeof reason === 'string' ? reason.trim().slice(0, 500) : null;
    else updates.reviewReason = null;
    await listing.update(updates);
    return res.json({ data: listing });
  } catch (error) {
    return next(error);
  }
}

module.exports = { login, getSession, getDashboard, reviewListing };
