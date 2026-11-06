const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ChatConversation = sequelize.define('ChatConversation', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  listingId: { type: DataTypes.UUID, allowNull: false, field: 'listing_id' },
  buyerId: { type: DataTypes.UUID, allowNull: false, field: 'buyer_id' },
  sellerId: { type: DataTypes.UUID, allowNull: false, field: 'seller_id' },
}, {
  tableName: 'chat_conversations',
  indexes: [{ unique: true, fields: ['listing_id', 'buyer_id'] }],
});

module.exports = ChatConversation;
