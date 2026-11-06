const express = require('express');
const regionsController = require('../controllers/regionsController');

const router = express.Router();
router.get('/', regionsController.listRegions);

module.exports = router;
