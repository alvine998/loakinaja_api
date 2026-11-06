const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Favorite = sequelize.define('Favorite', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
  listingId: { type: DataTypes.UUID, allowNull: false, field: 'listing_id' },
}, {
  tableName: 'favorites',
  indexes: [{ unique: true, fields: ['user_id', 'listing_id'] }],
});

module.exports = Favorite;
