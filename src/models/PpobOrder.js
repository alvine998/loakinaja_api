const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PpobOrder = sequelize.define('PpobOrder', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: true, field: 'user_id' },
  type: { type: DataTypes.ENUM('prepaid', 'postpaid'), allowNull: false },
  productCode: { type: DataTypes.STRING(100), allowNull: false, field: 'product_code' },
  productName: { type: DataTypes.STRING(180), allowNull: false, field: 'product_name' },
  category: { type: DataTypes.STRING(100), allowNull: true },
  brand: { type: DataTypes.STRING(100), allowNull: true },
  customerNo: { type: DataTypes.STRING(180), allowNull: false, field: 'customer_no' },
  refId: { type: DataTypes.STRING(40), allowNull: false, unique: true, field: 'ref_id' },
  status: { type: DataTypes.ENUM('quoted', 'creating_payment', 'awaiting_payment', 'processing', 'pending', 'success', 'failed', 'expired'), allowNull: false, defaultValue: 'quoted' },
  providerStatus: { type: DataTypes.STRING(32), allowNull: true, field: 'provider_status' },
  responseCode: { type: DataTypes.STRING(8), allowNull: true, field: 'response_code' },
  message: { type: DataTypes.STRING(500), allowNull: true },
  serialNumber: { type: DataTypes.STRING(500), allowNull: true, field: 'serial_number' },
  providerPrice: { type: DataTypes.INTEGER, allowNull: false, field: 'provider_price' },
  amount: { type: DataTypes.INTEGER, allowNull: false },
  quoteData: { type: DataTypes.JSON, allowNull: true, field: 'quote_data' },
  quoteExpiresAt: { type: DataTypes.DATE, allowNull: false, field: 'quote_expires_at' },
  guestAccessTokenHash: { type: DataTypes.STRING(64), allowNull: true, field: 'guest_access_token_hash' },
  buyerName: { type: DataTypes.STRING(120), allowNull: true, field: 'buyer_name' },
  buyerEmail: { type: DataTypes.STRING(254), allowNull: true, field: 'buyer_email' },
  buyerPhone: { type: DataTypes.STRING(32), allowNull: true, field: 'buyer_phone' },
  mayarInvoiceId: { type: DataTypes.STRING(64), allowNull: true, field: 'mayar_invoice_id' },
  mayarTransactionId: { type: DataTypes.STRING(64), allowNull: true, unique: true, field: 'mayar_transaction_id' },
  paymentUrl: { type: DataTypes.STRING(2048), allowNull: true, field: 'payment_url' },
  paidAt: { type: DataTypes.DATE, allowNull: true, field: 'paid_at' },
  lastProviderCheckAt: { type: DataTypes.DATE, allowNull: true, field: 'last_provider_check_at' },
  completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
}, {
  tableName: 'ppob_orders',
  indexes: [{ fields: ['user_id', 'created_at'] }],
});

module.exports = PpobOrder;
