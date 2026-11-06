const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Category = sequelize.define('Category', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(80), allowNull: false, unique: true },
  slug: { type: DataTypes.STRING(96), allowNull: false, unique: true },
  icon: { type: DataTypes.STRING(40), allowNull: false },
}, { tableName: 'categories' });

module.exports = Category;
