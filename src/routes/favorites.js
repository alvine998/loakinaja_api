const express = require('express');
const { requireAuth } = require('../middleware/auth');
const favoritesController = require('../controllers/favoritesController');

const router = express.Router();
router.use(requireAuth);
router.get('/', favoritesController.listFavorites);
router.get('/:listingId', favoritesController.getFavoriteStatus);
router.post('/:listingId', favoritesController.addFavorite);
router.delete('/:listingId', favoritesController.removeFavorite);

module.exports = router;
