const PERMISSIONS = [
  'dashboard:view',
  'users:view',
  'referrals:view',
  'listings:view',
  'listings:review',
  'transactions:view',
  'finance:view',
  'escrow:manage',
  'admins:manage',
  'profile:manage',
];

const DEFAULT_ROLES = [
  { key: 'super_admin', label: 'Super Admin', permissions: [...PERMISSIONS] },
  { key: 'admin', label: 'Admin', permissions: PERMISSIONS.filter((permission) => permission !== 'admins:manage') },
  { key: 'finance', label: 'Finance', permissions: ['dashboard:view', 'transactions:view', 'finance:view', 'escrow:manage', 'profile:manage'] },
  { key: 'support', label: 'Support', permissions: ['dashboard:view', 'users:view', 'referrals:view', 'listings:view', 'listings:review', 'profile:manage'] },
];

module.exports = { PERMISSIONS, DEFAULT_ROLES };
