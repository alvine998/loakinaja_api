const { DEFAULT_ROLES } = require('../../src/config/adminRoles');

async function ensureAdminRolesSchema(sequelize) {
  const [roleColumns] = await sequelize.query("SHOW COLUMNS FROM `admin_roles` LIKE 'key'");
  if (!roleColumns.length) {
    await sequelize.query('CREATE TABLE `admin_roles` (`key` VARCHAR(64) NOT NULL, `label` VARCHAR(100) NOT NULL, `permissions` JSON NOT NULL, `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL, PRIMARY KEY (`key`)) ENGINE=InnoDB');
  }

  const [columns] = await sequelize.query("SHOW COLUMNS FROM `admins` LIKE 'role'");
  if (!columns.length) await sequelize.query("ALTER TABLE `admins` ADD COLUMN `role` VARCHAR(64) NOT NULL DEFAULT 'admin'");
  else if (columns[0].Type.startsWith('enum(')) await sequelize.query("ALTER TABLE `admins` MODIFY COLUMN `role` VARCHAR(64) NOT NULL DEFAULT 'admin'");

  for (const role of DEFAULT_ROLES) {
    await sequelize.query(
      'INSERT INTO `admin_roles` (`key`, `label`, `permissions`, `created_at`, `updated_at`) VALUES (?, ?, ?, NOW(), NOW()) ON DUPLICATE KEY UPDATE `key` = `key`',
      { replacements: [role.key, role.label, JSON.stringify(role.permissions)] },
    );
  }

  for (const roleKey of ['super_admin', 'admin', 'finance']) {
    await sequelize.query(
      'UPDATE `admin_roles` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, "$", ?) WHERE `key` = ? AND JSON_CONTAINS(`permissions`, JSON_QUOTE(?)) = 0',
      { replacements: ['ppob:manage', roleKey, 'ppob:manage'] },
    );
  }

  const [[existingSuperAdmin]] = await sequelize.query("SELECT `id` FROM `admins` WHERE `role` = 'super_admin' LIMIT 1");
  if (!existingSuperAdmin) {
    await sequelize.query("UPDATE `admins` SET `role` = 'super_admin' ORDER BY `created_at` ASC LIMIT 1");
  }
}

module.exports = { ensureAdminRolesSchema };
