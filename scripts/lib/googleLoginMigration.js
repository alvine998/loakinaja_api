async function ensureGoogleLoginSchema(sequelize) {
  const [columns] = await sequelize.query("SHOW COLUMNS FROM `users` LIKE 'is_google_login'");
  if (!columns.length) {
    await sequelize.query('ALTER TABLE `users` ADD COLUMN `is_google_login` TINYINT(1) NOT NULL DEFAULT 0');
  }
}

module.exports = { ensureGoogleLoginSchema };
