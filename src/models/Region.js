const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Region = sequelize.define('Region', {
  id: { type: DataTypes.STRING(16), primaryKey: true },
  name: { type: DataTypes.STRING(120), allowNull: false },
  type: { type: DataTypes.ENUM('province', 'regency', 'district'), allowNull: false },
  parentId: { type: DataTypes.STRING(16), allowNull: true, field: 'parent_id' },
}, {
  tableName: 'regions',
  indexes: [{ fields: ['type', 'parent_id'] }],
});

module.exports = Region;
