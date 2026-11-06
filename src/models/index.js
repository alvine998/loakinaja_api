const User = require('./User');
const Listing = require('./Listing');
const Admin = require('./Admin');
const AdminRole = require('./AdminRole');
const EscrowAccount = require('./EscrowAccount');
const TokenOrder = require('./TokenOrder');
const PpobOrder = require('./PpobOrder');
const PpobCatalog = require('./PpobCatalog');

User.hasMany(Listing, { as: 'listings', foreignKey: 'userId', onDelete: 'CASCADE' });
Listing.belongsTo(User, { as: 'seller', foreignKey: 'userId' });
User.hasMany(TokenOrder, { as: 'tokenOrders', foreignKey: 'userId', onDelete: 'CASCADE' });
TokenOrder.belongsTo(User, { as: 'user', foreignKey: 'userId' });
User.hasMany(PpobOrder, { as: 'ppobOrders', foreignKey: 'userId', onDelete: 'CASCADE' });
PpobOrder.belongsTo(User, { as: 'user', foreignKey: 'userId' });

Admin.belongsTo(AdminRole, { foreignKey: 'role', targetKey: 'key', as: 'adminRole', constraints: false });
AdminRole.hasMany(Admin, { foreignKey: 'role', sourceKey: 'key', as: 'admins', constraints: false });

module.exports = { User, Listing, Admin, AdminRole, EscrowAccount, TokenOrder, PpobOrder, PpobCatalog };
