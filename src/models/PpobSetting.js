const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PpobSetting = sequelize.define('PpobSetting', {
  key: { type: DataTypes.STRING(64), primaryKey: true },
  value: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
}, {
  tableName: 'ppob_settings',
});

module.exports = PpobSetting;
