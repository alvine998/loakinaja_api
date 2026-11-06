const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { Admin, AdminRole, User } = require('../models');
const { DEFAULT_ROLES } = require('../config/adminRoles');

async function requireAdmin(req, res, next) {
  const authorization = req.get('authorization') || '';
  const [scheme, token] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (payload.role !== 'admin' || typeof payload.sub !== 'string') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const admin = await Admin.findByPk(payload.sub);
    if (!admin || admin.email !== payload.email) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const role = await AdminRole.findByPk(admin.role);
    const permissions = role?.permissions || (admin.role === 'super_admin'
      ? DEFAULT_ROLES[0].permissions
      : DEFAULT_ROLES.find((item) => item.key === admin.role)?.permissions || []);
    req.admin = { id: admin.id, email: admin.email, role: admin.role, permissions };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired admin token' });
  }
}

function requireAdminPermission(permission) {
  return (req, res, next) => {
    if (!req.admin?.permissions?.includes(permission)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action' });
    }
    return next();
  };
}

async function requireAuth(req, res, next) {
  const authorization = req.get('authorization') || '';
  const [scheme, token] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await User.findByPk(payload.sub);
    if (!user) return res.status(401).json({ error: 'Invalid or expired token' });
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function optionalAuth(req, res, next) {
  const authorization = req.get('authorization') || '';
  if (!authorization) return next();
  const [scheme, token] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Invalid authorization header' });
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await User.findByPk(payload.sub);
    if (!user) return res.status(401).json({ error: 'Invalid or expired token' });
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireAuth, optionalAuth, requireAdmin, requireAdminPermission };
