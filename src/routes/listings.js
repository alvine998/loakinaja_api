const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { imageUpload } = require('../middleware/upload');
const listingsController = require('../controllers/listingsController');

const router = express.Router();

router.get('/mine', requireAuth, listingsController.getMyListings);
router.get('/', listingsController.getListings);
router.get('/:id', listingsController.getListing);
router.post('/', requireAuth, imageUpload.array('images', 5), listingsController.createListing);
router.patch('/:id', requireAuth, listingsController.updateListing);
router.delete('/:id', requireAuth, listingsController.deleteListing);

module.exports = router;
