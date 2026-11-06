const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { Admin, AdminRole, EscrowAccount, Listing, PpobSetting, User } = require('../models');
const sequelize = require('../config/database');
const { Op } = require('sequelize');
const { isConfigured: isR2Configured } = require('../config/storage');
const { DEFAULT_ROLES, PERMISSIONS } = require('../config/adminRoles');

async function login(req, res) {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const admin = await Admin.scope('withPassword').findOne({ where: { email: email.trim().toLowerCase() } });
  const passwordMatches = admin && await bcrypt.compare(password, admin.passwordHash).catch(() => false);
  if (!passwordMatches) {
    return res.status(401).json({ error: 'Invalid admin email or password' });
  }

  if (!env.jwtSecret) return res.status(503).json({ error: 'Admin authentication is not configured' });

  const token = jwt.sign(
    { role: 'admin', email: admin.email },
    env.jwtSecret,
    { subject: admin.id, expiresIn: '8h' },
  );
  const role = await AdminRole.findByPk(admin.role);
  const permissions = role?.permissions || DEFAULT_ROLES.find((item) => item.key === admin.role)?.permissions || [];
  return res.json({ token, admin: { email: admin.email, role: admin.role, permissions } });
}

async function getSession(req, res) {
  return res.json({ authenticated: true, admin: req.admin });
}

function normalizeAdminEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function issueAdminToken(admin) {
  return jwt.sign({ role: 'admin', email: admin.email }, env.jwtSecret, { subject: admin.id, expiresIn: '8h' });
}

async function getAdmins(req, res, next) {
  try {
    const [admins, roles] = await Promise.all([
      Admin.findAll({ attributes: ['id', 'email', 'role', 'createdAt'], order: [['createdAt', 'ASC']] }),
      AdminRole.findAll({ order: [['key', 'ASC']] }),
    ]);
    return res.json({ data: admins, currentAdminId: req.admin.id, roles, permissions: PERMISSIONS });
  } catch (error) {
    return next(error);
  }
}

function validateRolePayload(body, { creating = false } = {}) {
  const key = typeof body?.key === 'string' ? body.key.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_') : '';
  const label = typeof body?.label === 'string' ? body.label.trim() : '';
  const permissions = body?.permissions;
  if (!key || key.length > 64 || !/^[a-z0-9][a-z0-9_-]*$/.test(key)) return { error: 'Role key must be 1-64 characters using letters, numbers, _ or -' };
  if (!label || label.length > 100) return { error: 'Role label is required and must be at most 100 characters' };
  if (!Array.isArray(permissions) || permissions.some((permission) => !PERMISSIONS.includes(permission))) {
    return { error: 'permissions must be an array of supported permission keys' };
  }
  if (creating && key === 'super_admin') return { error: 'super_admin is a protected system role' };
  return { data: { key, label, permissions: [...new Set(permissions)] } };
}

async function createAdminRole(req, res, next) {
  try {
    const result = validateRolePayload(req.body, { creating: true });
    if (result.error) return res.status(400).json({ error: result.error });
    if (await AdminRole.findByPk(result.data.key)) return res.status(409).json({ error: 'Role key already exists' });
    const role = await AdminRole.create(result.data);
    return res.status(201).json({ data: role });
  } catch (error) {
    return next(error);
  }
}

async function updateAdminRole(req, res, next) {
  try {
    if (req.params.key === 'super_admin') return res.status(400).json({ error: 'super_admin is a protected system role' });
    const role = await AdminRole.findByPk(req.params.key);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    const result = validateRolePayload({ ...req.body, key: role.key });
    if (result.error) return res.status(400).json({ error: result.error });
    await role.update({ label: result.data.label, permissions: result.data.permissions });
    return res.json({ data: role });
  } catch (error) {
    return next(error);
  }
}

async function deleteAdminRole(req, res, next) {
  try {
    if (req.params.key === 'super_admin') return res.status(400).json({ error: 'super_admin is a protected system role' });
    const role = await AdminRole.findByPk(req.params.key);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (await Admin.count({ where: { role: role.key } })) return res.status(409).json({ error: 'Role is assigned to admins; reassign them before deleting it' });
    await role.destroy();
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
}

async function createAdmin(req, res, next) {
  try {
    const email = normalizeAdminEmail(req.body?.email);
    const password = req.body?.password;
    const role = req.body?.role || 'admin';
    if (!email || typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'A valid email and password of 8 to 128 characters are required' });
    }
    if (!await AdminRole.findByPk(role)) return res.status(400).json({ error: 'role must reference an existing admin role' });
    const passwordHash = await bcrypt.hash(password, 12);
    const admin = await Admin.create({ email, passwordHash, role });
    return res.status(201).json({ data: { id: admin.id, email: admin.email, role: admin.role, createdAt: admin.createdAt } });
  } catch (error) {
    return next(error);
  }
}

async function updateAdmin(req, res, next) {
  try {
    if (req.params.id === req.admin.id) return res.status(400).json({ error: 'Use profile settings to change your own account' });
    const admin = await Admin.findByPk(req.params.id);
    if (!admin) return res.status(404).json({ error: 'Admin not found' });
    const email = normalizeAdminEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: 'A valid email is required' });
    const role = req.body.role;
    if (role !== undefined && !await AdminRole.findByPk(role)) return res.status(400).json({ error: 'role must reference an existing admin role' });
    if (admin.role === 'super_admin' && role && role !== 'super_admin' && await Admin.count({ where: { role: 'super_admin' } }) <= 1) {
      return res.status(409).json({ error: 'At least one super admin account must remain' });
    }
    const updates = { email, ...(role ? { role } : {}) };
    if (req.body.password !== undefined) {
      if (typeof req.body.password !== 'string' || req.body.password.length < 8 || req.body.password.length > 128) {
        return res.status(400).json({ error: 'Password must be 8 to 128 characters' });
      }
      updates.passwordHash = await bcrypt.hash(req.body.password, 12);
    }
    await admin.update(updates);
    return res.json({ data: { id: admin.id, email: admin.email, role: admin.role, createdAt: admin.createdAt } });
  } catch (error) {
    return next(error);
  }
}

async function deleteAdmin(req, res, next) {
  try {
    if (req.params.id === req.admin.id) return res.status(400).json({ error: 'You cannot delete your own admin account' });
    const admin = await Admin.findByPk(req.params.id);
    if (!admin) return res.status(404).json({ error: 'Admin not found' });
    const adminCount = await Admin.count();
    if (adminCount <= 1) return res.status(409).json({ error: 'At least one admin account must remain' });
    if (admin.role === 'super_admin' && await Admin.count({ where: { role: 'super_admin' } }) <= 1) {
      return res.status(409).json({ error: 'At least one super admin account must remain' });
    }
    await admin.destroy();
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
}

async function updateAdminProfile(req, res, next) {
  try {
    const { currentPassword, password } = req.body || {};
    const email = normalizeAdminEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: 'A valid email is required' });
    const changingPassword = password !== undefined && password !== '';
    if (changingPassword && (typeof password !== 'string' || password.length < 8 || password.length > 128)) {
      return res.status(400).json({ error: 'New password must be 8 to 128 characters' });
    }
    if (changingPassword && typeof currentPassword !== 'string') {
      return res.status(400).json({ error: 'Current password is required to change password' });
    }
    const admin = await Admin.scope('withPassword').findByPk(req.admin.id);
    if (!admin) return res.status(404).json({ error: 'Admin not found' });
    if (changingPassword && !await bcrypt.compare(currentPassword, admin.passwordHash)) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    const updates = { email };
    if (changingPassword) updates.passwordHash = await bcrypt.hash(password, 12);
    await admin.update(updates);
    return res.json({ data: { id: admin.id, email: admin.email }, token: issueAdminToken(admin) });
  } catch (error) {
    return next(error);
  }
}

async function getDashboard(req, res, next) {
  try {
    const [users, listings] = await Promise.all([
      User.findAll({ order: [['createdAt', 'DESC']] }),
      Listing.findAll({
        include: [{ model: User, as: 'seller', attributes: ['id', 'name', 'email', 'phone'] }],
        order: [['createdAt', 'DESC']],
      }),
    ]);
    return res.json({ data: {
      users: req.admin.permissions.includes('users:view') ? users : [],
      listings: req.admin.permissions.includes('listings:view') ? listings : [],
      orders: [],
    }, capabilities: { payments: false, imageStorage: isR2Configured } });
  } catch (error) {
    return next(error);
  }
}

async function reviewListing(req, res, next) {
  try {
    const { decision, reason } = req.body || {};
    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be approve or reject' });
    }
    const listing = await Listing.findByPk(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.status !== 'pending') {
      return res.status(409).json({ error: 'Only pending listings can be reviewed' });
    }

    const updates = {
      status: decision === 'approve' ? 'active' : 'rejected',
    };
    if (decision === 'reject') updates.reviewReason = typeof reason === 'string' ? reason.trim().slice(0, 500) : null;
    else updates.reviewReason = null;
    await listing.update(updates);
    return res.json({ data: listing });
  } catch (error) {
    return next(error);
  }
}

async function reviewListingsBulk(req, res, next) {
  try {
    const { ids, decision, reason } = req.body || {};
    if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some((id) => typeof id !== 'string')) {
      return res.status(400).json({ error: 'ids must be an array of 1 to 100 listing IDs' });
    }
    const uniqueIds = [...new Set(ids)];
    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be approve or reject' });
    }
    const updates = {
      status: decision === 'approve' ? 'active' : 'rejected',
      reviewReason: decision === 'reject' && typeof reason === 'string' ? reason.trim().slice(0, 500) : null,
    };
    const updated = await sequelize.transaction(async (transaction) => {
      const listings = await Listing.findAll({
        where: { id: { [Op.in]: uniqueIds }, status: 'pending' },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      for (const listing of listings) await listing.update(updates, { transaction });
      return listings;
    });
    const updatedIds = new Set(updated.map((listing) => listing.id));
    return res.json({ data: updated, skippedIds: uniqueIds.filter((id) => !updatedIds.has(id)) });
  } catch (error) {
    return next(error);
  }
}

function validateEscrowAccount(body) {
  const bankName = typeof body.bankName === 'string' ? body.bankName.trim() : '';
  const accountNumber = typeof body.accountNumber === 'string' ? body.accountNumber.trim() : '';
  const accountHolder = typeof body.accountHolder === 'string' ? body.accountHolder.trim() : '';
  if (!bankName || !accountNumber || !accountHolder) return null;
  if (bankName.length > 80 || accountNumber.length > 64 || accountHolder.length > 120) return null;
  return { bankName, accountNumber, accountHolder };
}

async function getEscrowAccounts(req, res, next) {
  try {
    const accounts = await EscrowAccount.findAll({ order: [['isActive', 'DESC'], ['createdAt', 'DESC']] });
    return res.json({ data: accounts });
  } catch (error) {
    return next(error);
  }
}

async function getActiveEscrowAccount(req, res, next) {
  try {
    const account = await EscrowAccount.findOne({ where: { isActive: true } });
    return res.json({ data: account });
  } catch (error) {
    return next(error);
  }
}

async function createEscrowAccount(req, res, next) {
  try {
    const details = validateEscrowAccount(req.body || {});
    if (!details) return res.status(400).json({ error: 'bankName, accountNumber, and accountHolder are required (maximum 80, 64, and 120 characters)' });
    const isActive = req.body.isActive === true;
    const account = await sequelize.transaction(async (transaction) => {
      if (isActive) await EscrowAccount.update({ isActive: false }, { where: {}, transaction });
      return EscrowAccount.create({ ...details, isActive }, { transaction });
    });
    return res.status(201).json({ data: account });
  } catch (error) {
    return next(error);
  }
}

async function updateEscrowAccount(req, res, next) {
  try {
    const account = await EscrowAccount.findByPk(req.params.id);
    if (!account) return res.status(404).json({ error: 'Escrow account not found' });
    const details = validateEscrowAccount(req.body || {});
    if (!details) return res.status(400).json({ error: 'bankName, accountNumber, and accountHolder are required (maximum 80, 64, and 120 characters)' });
    if (typeof req.body.isActive !== 'boolean') return res.status(400).json({ error: 'isActive must be a boolean' });
    await sequelize.transaction(async (transaction) => {
      if (req.body.isActive) await EscrowAccount.update({ isActive: false }, { where: {}, transaction });
      await account.update({ ...details, isActive: req.body.isActive }, { transaction });
    });
    return res.json({ data: account });
  } catch (error) {
    return next(error);
  }
}

async function deleteEscrowAccount(req, res, next) {
  try {
    const account = await EscrowAccount.findByPk(req.params.id);
    if (!account) return res.status(404).json({ error: 'Escrow account not found' });
    await account.destroy();
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
}

async function getPpobSettings(req, res, next) {
  try {
    const setting = await PpobSetting.findByPk('markup_rupiah');
    return res.json({ data: { markupRupiah: Number(setting?.value ?? env.digiflazz.markup) } });
  } catch (error) {
    return next(error);
  }
}

async function updatePpobSettings(req, res, next) {
  try {
    const markupRupiah = req.body?.markupRupiah;
    if (!Number.isSafeInteger(markupRupiah) || markupRupiah < 0 || markupRupiah > 10000000) {
      return res.status(400).json({ error: 'markupRupiah must be a whole number from 0 to 10000000' });
    }
    const [setting] = await PpobSetting.findOrCreate({
      where: { key: 'markup_rupiah' },
      defaults: { value: markupRupiah },
    });
    if (setting.value !== markupRupiah) await setting.update({ value: markupRupiah });
    return res.json({ data: { markupRupiah: Number(setting.value) } });
  } catch (error) {
    return next(error);
  }
}

module.exports = { login, getSession, getAdmins, createAdmin, updateAdmin, deleteAdmin, createAdminRole, updateAdminRole, deleteAdminRole, updateAdminProfile, getDashboard, reviewListing, reviewListingsBulk, getEscrowAccounts, getActiveEscrowAccount, createEscrowAccount, updateEscrowAccount, deleteEscrowAccount, getPpobSettings, updatePpobSettings };
