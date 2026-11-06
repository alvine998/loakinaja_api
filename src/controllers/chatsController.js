const { Op } = require('sequelize');
const { ChatConversation, ChatMessage, Listing, User } = require('../models');

const conversationInclude = [
  { model: Listing, as: 'listing', attributes: ['id', 'title', 'status'] },
  { model: User, as: 'buyer', attributes: ['id', 'name'] },
  { model: User, as: 'seller', attributes: ['id', 'name'] },
];

async function listConversations(req, res, next) {
  try {
    const conversations = await ChatConversation.findAll({
      where: { [Op.or]: [{ buyerId: req.user.id }, { sellerId: req.user.id }] },
      include: conversationInclude,
      order: [['updatedAt', 'DESC']],
    });
    const data = await Promise.all(conversations.map(async (conversation) => ({
      ...conversation.toJSON(),
      lastMessage: await ChatMessage.findOne({
        where: { conversationId: conversation.id },
        order: [['createdAt', 'DESC']],
      }),
    })));
    return res.json({ data });
  } catch (error) {
    return next(error);
  }
}

async function openConversation(req, res, next) {
  try {
    const listingId = typeof req.body?.listingId === 'string' ? req.body.listingId : '';
    if (!listingId) return res.status(400).json({ error: 'listingId is required' });
    const listing = await Listing.findOne({ where: { id: listingId, status: 'active' } });
    if (!listing) return res.status(404).json({ error: 'Active listing not found' });
    if (listing.userId === req.user.id) return res.status(400).json({ error: 'You cannot start a chat with yourself' });

    const [conversation] = await ChatConversation.findOrCreate({
      where: { listingId: listing.id, buyerId: req.user.id },
      defaults: { listingId: listing.id, buyerId: req.user.id, sellerId: listing.userId },
    });
    await conversation.reload({ include: conversationInclude });
    return res.status(200).json({ data: conversation });
  } catch (error) {
    return next(error);
  }
}

async function getMessages(req, res, next) {
  try {
    const conversation = await ChatConversation.findByPk(req.params.id);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (conversation.buyerId !== req.user.id && conversation.sellerId !== req.user.id) {
      return res.status(403).json({ error: 'You cannot view this conversation' });
    }
    const messages = await ChatMessage.findAll({
      where: { conversationId: conversation.id },
      include: [{ model: User, as: 'sender', attributes: ['id', 'name'] }],
      order: [['createdAt', 'ASC']],
      limit: 500,
    });
    return res.json({ data: messages });
  } catch (error) {
    return next(error);
  }
}

async function sendMessage(req, res, next) {
  try {
    const conversation = await ChatConversation.findByPk(req.params.id);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (conversation.buyerId !== req.user.id && conversation.sellerId !== req.user.id) {
      return res.status(403).json({ error: 'You cannot send messages to this conversation' });
    }
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) return res.status(400).json({ error: 'Message text is required' });
    if (text.length > 2000) return res.status(400).json({ error: 'Message must be 2000 characters or fewer' });

    const message = await ChatMessage.create({ conversationId: conversation.id, senderId: req.user.id, text });
    await message.reload({ include: [{ model: User, as: 'sender', attributes: ['id', 'name'] }] });
    await conversation.update({ updatedAt: new Date() });
    return res.status(201).json({ data: message });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listConversations, openConversation, getMessages, sendMessage };
