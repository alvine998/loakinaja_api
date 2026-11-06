const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { requireAdmin, requireAdminPermission } = require('../middleware/auth');
const adminController = require('../controllers/adminController');
const withdrawalsController = require('../controllers/withdrawalsController');
const escrowSalesController = require('../controllers/escrowSalesController');

const router = express.Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

router.post('/login', loginLimiter, adminController.login);
router.get('/session', requireAdmin, adminController.getSession);
router.get('/admins', requireAdmin, requireAdminPermission('admins:manage'), adminController.getAdmins);
router.post('/roles', requireAdmin, requireAdminPermission('admins:manage'), adminController.createAdminRole);
router.patch('/roles/:key', requireAdmin, requireAdminPermission('admins:manage'), adminController.updateAdminRole);
router.delete('/roles/:key', requireAdmin, requireAdminPermission('admins:manage'), adminController.deleteAdminRole);
router.post('/admins', requireAdmin, requireAdminPermission('admins:manage'), adminController.createAdmin);
router.patch('/admins/:id', requireAdmin, requireAdminPermission('admins:manage'), adminController.updateAdmin);
router.delete('/admins/:id', requireAdmin, requireAdminPermission('admins:manage'), adminController.deleteAdmin);
router.patch('/profile', requireAdmin, requireAdminPermission('profile:manage'), adminController.updateAdminProfile);
router.get('/dashboard', requireAdmin, requireAdminPermission('dashboard:view'), adminController.getDashboard);
router.post('/listings/review-bulk', requireAdmin, requireAdminPermission('listings:review'), adminController.reviewListingsBulk);
router.patch('/listings/:id/review', requireAdmin, requireAdminPermission('listings:review'), adminController.reviewListing);
router.get('/escrow-accounts', requireAdmin, requireAdminPermission('escrow:manage'), adminController.getEscrowAccounts);
router.post('/escrow-accounts', requireAdmin, requireAdminPermission('escrow:manage'), adminController.createEscrowAccount);
router.patch('/escrow-accounts/:id', requireAdmin, requireAdminPermission('escrow:manage'), adminController.updateEscrowAccount);
router.delete('/escrow-accounts/:id', requireAdmin, requireAdminPermission('escrow:manage'), adminController.deleteEscrowAccount);
router.get('/ppob-settings', requireAdmin, requireAdminPermission('ppob:manage'), adminController.getPpobSettings);
router.patch('/ppob-settings', requireAdmin, requireAdminPermission('ppob:manage'), adminController.updatePpobSettings);
router.get('/withdrawals', requireAdmin, requireAdminPermission('finance:view'), withdrawalsController.listAllWithdrawals);
router.get('/seller-balances', requireAdmin, requireAdminPermission('finance:view'), withdrawalsController.listAllBalances);
router.patch('/withdrawals/:id', requireAdmin, requireAdminPermission('finance:view'), withdrawalsController.processWithdrawal);
router.get('/escrow-sales', requireAdmin, requireAdminPermission('finance:view'), escrowSalesController.listAllSales);
router.patch('/escrow-sales/:id', requireAdmin, requireAdminPermission('finance:view'), escrowSalesController.processPayment);

module.exports = router;
