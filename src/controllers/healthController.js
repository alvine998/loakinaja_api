const sequelize = require('../config/database');

async function getHealth(req, res) {
  try {
    await sequelize.authenticate();
    return res.json({ status: 'ok', database: 'connected' });
  } catch {
    return res.status(503).json({ status: 'error', database: 'unavailable' });
  }
}

module.exports = { getHealth };
