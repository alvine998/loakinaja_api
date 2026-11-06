const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Admin = sequelize.define('Admin', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  email: { type: DataTypes.STRING(254), allowNull: false, unique: true, set(value) {
    this.setDataValue('email', value.trim().toLowerCase());
  } },
  passwordHash: { type: DataTypes.STRING(255), allowNull: false, field: 'password_hash' },
  role: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'admin' },
}, {
  tableName: 'admins',
  defaultScope: { attributes: { exclude: ['passwordHash'] } },
  scopes: { withPassword: { attributes: { include: ['passwordHash'] } } },
});

module.exports = Admin;
