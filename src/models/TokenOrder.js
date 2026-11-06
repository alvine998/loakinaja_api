const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TokenOrder = sequelize.define('TokenOrder', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
  packageId: { type: DataTypes.STRING(32), allowNull: false, field: 'package_id' },
  packageLabel: { type: DataTypes.STRING(80), allowNull: false, field: 'package_label' },
  tokens: { type: DataTypes.INTEGER, allowNull: false },
  pricePerToken: { type: DataTypes.INTEGER, allowNull: false, field: 'price_per_token' },
  amount: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'paid', 'failed', 'expired'), allowNull: false, defaultValue: 'pending' },
  mayarInvoiceId: { type: DataTypes.STRING(64), allowNull: true, field: 'mayar_invoice_id' },
  mayarTransactionId: { type: DataTypes.STRING(64), allowNull: true, unique: true, field: 'mayar_transaction_id' },
  paymentUrl: { type: DataTypes.STRING(2048), allowNull: true, field: 'payment_url' },
  expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
  paidAt: { type: DataTypes.DATE, allowNull: true, field: 'paid_at' },
}, {
  tableName: 'token_orders',
  indexes: [{ fields: ['user_id', 'created_at'] }],
});

module.exports = TokenOrder;
