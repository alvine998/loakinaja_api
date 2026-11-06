const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { env } = require('./config/env');
const authRoutes = require('./routes/auth');
const healthRoutes = require('./routes/health');
const listingRoutes = require('./routes/listings');
const adminRoutes = require('./routes/admin');
const escrowAccountRoutes = require('./routes/escrowAccounts');
const tokenOrderRoutes = require('./routes/tokenOrders');
const tokenOrdersController = require('./controllers/tokenOrdersController');
const ppobController = require('./controllers/ppobController');
const ppobRoutes = require('./routes/ppob');
const { notFound, errorHandler } = require('./middleware/errors');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb', verify: (req, res, buffer) => { req.rawBody = Buffer.from(buffer); } }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.post('/api/payments/mayar/webhook', tokenOrdersController.webhook);
app.post('/api/ppob/digiflazz-webhook', ppobController.digiflazzWebhook);
app.use('/api/token-orders', tokenOrderRoutes);
app.use('/api/ppob', ppobRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/escrow-accounts', escrowAccountRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
