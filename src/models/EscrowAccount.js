const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EscrowAccount = sequelize.define('EscrowAccount', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  bankName: { type: DataTypes.STRING(80), allowNull: false, field: 'bank_name' },
  accountNumber: { type: DataTypes.STRING(64), allowNull: false, field: 'account_number' },
  accountHolder: { type: DataTypes.STRING(120), allowNull: false, field: 'account_holder' },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_active' },
}, { tableName: 'escrow_accounts' });

module.exports = EscrowAccount;
