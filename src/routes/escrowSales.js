const express = require('express');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/escrowSalesController');

const router = express.Router();
router.use(requireAuth);
router.get('/', controller.listMySales);
router.post('/', controller.createSale);
router.get('/:id', controller.getSale);
router.post('/:id/submit-payment', controller.submitPayment);
router.post('/:id/confirm-delivery', controller.confirmDelivery);

module.exports = router;
