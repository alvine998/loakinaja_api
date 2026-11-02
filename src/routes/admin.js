const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { requireAdmin } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

const router = express.Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

router.post('/login', loginLimiter, adminController.login);
router.get('/session', requireAdmin, adminController.getSession);
router.get('/dashboard', requireAdmin, adminController.getDashboard);
router.patch('/listings/:id/review', requireAdmin, adminController.reviewListing);

module.exports = router;
