const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(120), allowNull: false },
  email: { type: DataTypes.STRING(254), allowNull: false, unique: true, set(value) {
    this.setDataValue('email', value.trim().toLowerCase());
  } },
  phone: { type: DataTypes.STRING(32), allowNull: false },
  passwordHash: { type: DataTypes.STRING(255), allowNull: false, field: 'password_hash' },
  tokens: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3 },
  referralCode: { type: DataTypes.STRING(16), allowNull: false, unique: true, field: 'referral_code' },
  referredBy: { type: DataTypes.UUID, allowNull: true, field: 'referred_by' },
  isGoogleLogin: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_google_login' },
}, {
  tableName: 'users',
  defaultScope: { attributes: { exclude: ['passwordHash'] } },
  scopes: { withPassword: { attributes: { include: ['passwordHash'] } } },
});

module.exports = User;
