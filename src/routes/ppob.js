const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const controller = require('../controllers/ppobController');

const router = express.Router();
const guestPurchaseLimit = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
const guestStatusLimit = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false });
router.get('/products', controller.getProducts);
router.post('/quotes', guestPurchaseLimit, optionalAuth, controller.createQuote);
router.get('/guest-orders/:id', guestStatusLimit, controller.getGuestOrder);
router.post('/guest-orders/:id/payment', guestPurchaseLimit, controller.startPayment);
router.post('/guest-orders/:id/verify-payment', guestStatusLimit, controller.verifyPayment);
router.use(optionalAuth);
router.get('/orders', requireAuth, controller.listOrders);
router.get('/orders/:id', requireAuth, controller.getOrder);
router.post('/orders/:id/payment', requireAuth, controller.startPayment);
router.post('/orders/:id/verify-payment', requireAuth, controller.verifyPayment);

module.exports = router;
