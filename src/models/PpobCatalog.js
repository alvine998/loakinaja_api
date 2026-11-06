const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PpobCatalog = sequelize.define('PpobCatalog', {
  type: { type: DataTypes.ENUM('prepaid', 'postpaid'), primaryKey: true, allowNull: false },
  products: { type: DataTypes.JSON, allowNull: false },
  fetchedAt: { type: DataTypes.DATE, allowNull: false, field: 'fetched_at' },
  lastAttemptAt: { type: DataTypes.DATE, allowNull: true, field: 'last_attempt_at' },
}, {
  tableName: 'ppob_catalogs',
  timestamps: false,
});

module.exports = PpobCatalog;
