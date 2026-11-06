const express = require('express');
const { getActiveEscrowAccount } = require('../controllers/adminController');

const router = express.Router();

router.get('/active', getActiveEscrowAccount);

module.exports = router;
