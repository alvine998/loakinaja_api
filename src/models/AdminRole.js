const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AdminRole = sequelize.define('AdminRole', {
  key: { type: DataTypes.STRING(64), primaryKey: true },
  label: { type: DataTypes.STRING(100), allowNull: false },
  permissions: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
}, { tableName: 'admin_roles' });

module.exports = AdminRole;
