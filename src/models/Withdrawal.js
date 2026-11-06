const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Withdrawal = sequelize.define('Withdrawal', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
  amount: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  bankName: { type: DataTypes.STRING(80), allowNull: false, field: 'bank_name' },
  accountNumber: { type: DataTypes.STRING(64), allowNull: false, field: 'account_number' },
  accountHolder: { type: DataTypes.STRING(120), allowNull: false, field: 'account_holder' },
  status: { type: DataTypes.ENUM('pending', 'paid', 'rejected'), allowNull: false, defaultValue: 'pending' },
  processedAt: { type: DataTypes.DATE, allowNull: true, field: 'processed_at' },
  adminNote: { type: DataTypes.STRING(500), allowNull: true, field: 'admin_note' },
}, {
  tableName: 'withdrawals',
  indexes: [{ fields: ['user_id', 'created_at'] }, { fields: ['status', 'created_at'] }],
});

module.exports = Withdrawal;
