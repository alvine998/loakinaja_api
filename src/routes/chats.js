const express = require('express');
const { requireAuth } = require('../middleware/auth');
const chatsController = require('../controllers/chatsController');

const router = express.Router();
router.use(requireAuth);
router.get('/', chatsController.listConversations);
router.post('/', chatsController.openConversation);
router.get('/:id/messages', chatsController.getMessages);
router.post('/:id/messages', chatsController.sendMessage);

module.exports = router;
