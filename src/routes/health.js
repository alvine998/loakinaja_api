const express = require('express');
const sequelize = require('../config/database');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    await sequelize.authenticate();
    return res.json({ status: 'ok', database: 'connected' });
  } catch {
    return res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

module.exports = router;
