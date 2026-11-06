async function ensureProfilePhotoSchema(sequelize) {
  const [columns] = await sequelize.query("SHOW COLUMNS FROM `users` LIKE 'profile_photo'");
  if (!columns.length) {
    await sequelize.query('ALTER TABLE `users` ADD COLUMN `profile_photo` VARCHAR(2048) NULL');
  }
}

module.exports = { ensureProfilePhotoSchema };
