async function ensurePpobCatalogSchema(sequelize) {
  const [tables] = await sequelize.query("SHOW TABLES LIKE 'ppob_catalogs'");
  if (!tables.length) {
    await sequelize.query(`CREATE TABLE \`ppob_catalogs\` (
      \`type\` ENUM('prepaid', 'postpaid') NOT NULL PRIMARY KEY,
      \`products\` JSON NOT NULL,
      \`fetched_at\` DATETIME NOT NULL,
      \`last_attempt_at\` DATETIME NULL
    )`);
    return;
  }

  const [columns] = await sequelize.query("SHOW COLUMNS FROM `ppob_catalogs` LIKE 'last_attempt_at'");
  if (!columns.length) {
    await sequelize.query('ALTER TABLE `ppob_catalogs` ADD COLUMN `last_attempt_at` DATETIME NULL');
  }
}

module.exports = { ensurePpobCatalogSchema };
