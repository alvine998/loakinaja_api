const { Favorite, Listing, User } = require('../models');

async function listFavorites(req, res, next) {
  try {
    const favorites = await Favorite.findAll({
      where: { userId: req.user.id },
      include: [{
        model: Listing,
        as: 'listing',
        where: { status: 'active' },
        include: [{ model: User, as: 'seller', attributes: ['id', 'name', 'createdAt'] }],
      }],
      order: [['createdAt', 'DESC']],
    });
    return res.json({ data: favorites.map((favorite) => favorite.listing) });
  } catch (error) {
    return next(error);
  }
}

async function addFavorite(req, res, next) {
  try {
    const listing = await Listing.findOne({ where: { id: req.params.listingId, status: 'active' } });
    if (!listing) return res.status(404).json({ error: 'Active listing not found' });
    const [favorite] = await Favorite.findOrCreate({
      where: { userId: req.user.id, listingId: listing.id },
      defaults: { userId: req.user.id, listingId: listing.id },
    });
    return res.status(201).json({ favorited: true, id: favorite.id });
  } catch (error) {
    return next(error);
  }
}

async function getFavoriteStatus(req, res, next) {
  try {
    const favorite = await Favorite.findOne({ where: { userId: req.user.id, listingId: req.params.listingId } });
    return res.json({ favorited: Boolean(favorite) });
  } catch (error) {
    return next(error);
  }
}

async function removeFavorite(req, res, next) {
  try {
    await Favorite.destroy({ where: { userId: req.user.id, listingId: req.params.listingId } });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
}

module.exports = { listFavorites, getFavoriteStatus, addFavorite, removeFavorite };
