const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Listing = sequelize.define('Listing', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
  title: { type: DataTypes.STRING(160), allowNull: false },
  category: { type: DataTypes.STRING(80), allowNull: false },
  price: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  condition: { type: DataTypes.STRING(40), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false },
  location: { type: DataTypes.STRING(160), allowNull: false },
  images: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  status: { type: DataTypes.ENUM('pending', 'active', 'rejected', 'sold'), allowNull: false, defaultValue: 'pending' },
  reviewReason: { type: DataTypes.STRING(500), allowNull: true, field: 'review_reason' },
}, { tableName: 'listings' });

module.exports = Listing;
