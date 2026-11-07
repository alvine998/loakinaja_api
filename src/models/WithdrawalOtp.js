const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const WithdrawalOtp = sequelize.define('WithdrawalOtp', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
  codeHash: { type: DataTypes.STRING(64), allowNull: false, field: 'code_hash' },
  requestHash: { type: DataTypes.STRING(64), allowNull: false, field: 'request_hash' },
  expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
  attempts: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
  usedAt: { type: DataTypes.DATE, allowNull: true, field: 'used_at' },
}, {
  tableName: 'withdrawal_otps',
  indexes: [{ fields: ['user_id', 'created_at'] }, { fields: ['expires_at'] }],
});

module.exports = WithdrawalOtp;
