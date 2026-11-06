const express = require('express');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/tokenOrdersController');

const router = express.Router();
router.post('/', requireAuth, controller.create);
router.get('/:id', requireAuth, controller.getOne);
router.post('/:id/verify', requireAuth, controller.verify);

module.exports = router;
