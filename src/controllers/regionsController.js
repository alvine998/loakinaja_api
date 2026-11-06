const { Op } = require('sequelize');
const { Region } = require('../models');

const validTypes = new Set(['province', 'regency', 'district']);

async function listRegions(req, res, next) {
  try {
    const { type, parentId } = req.query;
    if (!validTypes.has(type)) {
      return res.status(400).json({ error: 'type must be province, regency, or district' });
    }
    if (type === 'province' && parentId) {
      return res.status(400).json({ error: 'province regions do not have a parentId' });
    }
    if (type !== 'province' && (typeof parentId !== 'string' || !parentId.trim())) {
      return res.status(400).json({ error: 'parentId is required for regencies and districts' });
    }
    const where = { type };
    if (type === 'province') where.parentId = { [Op.is]: null };
    else where.parentId = parentId.trim();
    const data = await Region.findAll({
      where,
      attributes: ['id', 'name'],
      order: [['name', 'ASC']],
    });
    return res.json({ data });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listRegions };
