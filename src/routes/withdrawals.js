const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/withdrawalsController');

const router = express.Router();
router.use(requireAuth);
router.get('/', controller.getBalance);
router.post('/otp', rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false }), controller.sendWithdrawalOtp);
router.post('/', controller.requestWithdrawal);

module.exports = router;
