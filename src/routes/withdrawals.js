const express = require('express');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/withdrawalsController');

const router = express.Router();
router.use(requireAuth);
router.get('/', controller.getBalance);
router.post('/', controller.requestWithdrawal);

module.exports = router;
