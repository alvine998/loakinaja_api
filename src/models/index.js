const User = require('./User');
const Listing = require('./Listing');

User.hasMany(Listing, { as: 'listings', foreignKey: 'userId', onDelete: 'CASCADE' });
Listing.belongsTo(User, { as: 'seller', foreignKey: 'userId' });

module.exports = { User, Listing };
