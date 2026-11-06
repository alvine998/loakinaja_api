const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EscrowSale = sequelize.define('EscrowSale', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  listingId: { type: DataTypes.UUID, allowNull: false, field: 'listing_id' },
  listingTitle: { type: DataTypes.STRING(160), allowNull: true, field: 'listing_title' },
  buyerId: { type: DataTypes.UUID, allowNull: false, field: 'buyer_id' },
  sellerId: { type: DataTypes.UUID, allowNull: false, field: 'seller_id' },
  amount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  buyerName: { type: DataTypes.STRING(120), allowNull: true, field: 'buyer_name' },
  sellerName: { type: DataTypes.STRING(120), allowNull: true, field: 'seller_name' },
  escrowBankName: { type: DataTypes.STRING(80), allowNull: true, field: 'escrow_bank_name' },
  escrowAccountNumber: { type: DataTypes.STRING(64), allowNull: true, field: 'escrow_account_number' },
  escrowAccountHolder: { type: DataTypes.STRING(120), allowNull: true, field: 'escrow_account_holder' },
  status: { type: DataTypes.ENUM('awaiting_payment', 'payment_submitted', 'in_escrow', 'release_requested', 'released', 'cancelled'), allowNull: false, defaultValue: 'awaiting_payment' },
  paidAt: { type: DataTypes.DATE, allowNull: true, field: 'paid_at' },
  releasedAt: { type: DataTypes.DATE, allowNull: true, field: 'released_at' },
}, {
  tableName: 'escrow_sales',
  indexes: [{ fields: ['buyer_id', 'created_at'] }, { fields: ['seller_id', 'status'] }, { fields: ['listing_id', 'status'] }],
});

module.exports = EscrowSale;
