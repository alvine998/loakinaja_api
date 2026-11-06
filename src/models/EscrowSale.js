const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EscrowSale = sequelize.define('EscrowSale', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  listingId: { type: DataTypes.UUID, allowNull: false, field: 'listing_id' },
  buyerId: { type: DataTypes.UUID, allowNull: false, field: 'buyer_id' },
  sellerId: { type: DataTypes.UUID, allowNull: false, field: 'seller_id' },
  amount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  escrowBankName: { type: DataTypes.STRING(80), allowNull: false, field: 'escrow_bank_name' },
  escrowAccountNumber: { type: DataTypes.STRING(64), allowNull: false, field: 'escrow_account_number' },
  escrowAccountHolder: { type: DataTypes.STRING(120), allowNull: false, field: 'escrow_account_holder' },
  status: { type: DataTypes.ENUM('awaiting_payment', 'payment_submitted', 'in_escrow', 'released', 'cancelled'), allowNull: false, defaultValue: 'awaiting_payment' },
  paidAt: { type: DataTypes.DATE, allowNull: true, field: 'paid_at' },
  releasedAt: { type: DataTypes.DATE, allowNull: true, field: 'released_at' },
}, {
  tableName: 'escrow_sales',
  indexes: [{ fields: ['buyer_id', 'created_at'] }, { fields: ['seller_id', 'status'] }, { fields: ['listing_id', 'status'] }],
});

module.exports = EscrowSale;
