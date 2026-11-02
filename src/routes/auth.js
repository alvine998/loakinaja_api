const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth');
const authController = require('../controllers/authController');

const router = express.Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.get('/me', requireAuth, authController.getCurrentUser);
router.patch('/me', requireAuth, authController.updateCurrentUser);
router.post('/change-password', requireAuth, authController.changePassword);
router.get('/referral-count', requireAuth, authController.getReferralCount);

module.exports = router;
