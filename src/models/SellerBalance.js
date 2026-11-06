const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SellerBalance = sequelize.define('SellerBalance', {
  userId: { type: DataTypes.UUID, primaryKey: true, field: 'user_id' },
  availableAmount: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0, field: 'available_amount' },
}, { tableName: 'seller_balances' });

module.exports = SellerBalance;
