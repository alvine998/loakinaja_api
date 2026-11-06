const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ChatMessage = sequelize.define('ChatMessage', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  conversationId: { type: DataTypes.UUID, allowNull: false, field: 'conversation_id' },
  senderId: { type: DataTypes.UUID, allowNull: false, field: 'sender_id' },
  text: { type: DataTypes.STRING(2000), allowNull: false },
}, {
  tableName: 'chat_messages',
  indexes: [{ fields: ['conversation_id', 'created_at'] }],
});

module.exports = ChatMessage;
