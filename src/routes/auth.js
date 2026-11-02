const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { rateLimit } = require('express-rate-limit');
const { Op } = require('sequelize');
const { env } = require('../config/env');
const { User } = require('../models');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });

function publicUser(user) {
  const { id, name, email, phone, tokens, referralCode, referredBy, createdAt } = user;
  return { id, name, email, phone, tokens, referralCode, referredBy, createdAt };
}

function createToken(user) {
  return jwt.sign({}, env.jwtSecret, { subject: user.id, expiresIn: env.jwtExpiresIn });
}

router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { name, email, phone, password, referralCode } = req.body || {};
    if (![name, email, phone, password].every((value) => typeof value === 'string' && value.trim())) {
      return res.status(400).json({ error: 'name, email, phone, and password are required' });
    }
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });

    const normalizedEmail = email.trim().toLowerCase();
    if (await User.unscoped().findOne({ where: { email: normalizedEmail } })) {
      return res.status(409).json({ error: 'Email is already registered' });
    }

    let referredBy = null;
    if (referralCode?.trim()) {
      const referrer = await User.findOne({ where: { referralCode: referralCode.trim().toUpperCase() } });
      if (!referrer) return res.status(400).json({ error: 'Referral code not found' });
      referredBy = referrer.referralCode;
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      phone: phone.trim(),
      passwordHash: await bcrypt.hash(password, 12),
      referralCode: `LOAK${require('node:crypto').randomBytes(4).toString('hex').toUpperCase()}`,
      referredBy,
    });
    return res.status(201).json({ user: publicUser(user), token: createToken(user) });
  } catch (error) {
    return next(error);
  }
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const identifier = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!identifier || !password) return res.status(400).json({ error: 'email or phone and password are required' });

    const user = await User.scope('withPassword').findOne({
      where: { [Op.or]: [{ email: identifier.toLowerCase() }, { phone: identifier }] },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    return res.json({ user: publicUser(user), token: createToken(user) });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const { name, email, phone } = req.body || {};
    if (![name, email, phone].every((value) => typeof value === 'string' && value.trim())) {
      return res.status(400).json({ error: 'name, email, and phone are required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }
    await req.user.update({ name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim() });
    return res.json({ user: publicUser(req.user) });
  } catch (error) {
    return next(error);
  }
});

router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const user = await User.scope('withPassword').findByPk(req.user.id);
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    await user.update({ passwordHash: await bcrypt.hash(newPassword, 12) });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.get('/referral-count', requireAuth, async (req, res, next) => {
  try {
    const count = await User.count({ where: { referredBy: req.user.referralCode } });
    return res.json({ count });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
