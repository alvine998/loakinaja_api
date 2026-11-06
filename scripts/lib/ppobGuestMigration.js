async function ensurePpobGuestSchema(sequelize) {
  const [tables] = await sequelize.query("SHOW TABLES LIKE 'ppob_orders'");
  if (!tables.length) return;

  const [userIdColumns] = await sequelize.query("SHOW FULL COLUMNS FROM `ppob_orders` LIKE 'user_id'");
  const [userColumns] = await sequelize.query("SHOW FULL COLUMNS FROM `users` LIKE 'id'");
  if (userIdColumns.length && userColumns.length) {
    const userId = userIdColumns[0];
    const parentId = userColumns[0];
    const [constraints] = await sequelize.query(
      "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ppob_orders' AND COLUMN_NAME = 'user_id' AND REFERENCED_TABLE_NAME = 'users' AND REFERENCED_COLUMN_NAME = 'id'",
    );

    const needsAlter = userId.Null !== 'YES'
      || userId.Type.toLowerCase() !== parentId.Type.toLowerCase()
      || userId.Collation !== parentId.Collation;
    if (needsAlter) {
      for (const { CONSTRAINT_NAME: constraintName } of constraints) {
        const safeName = constraintName.replace(/`/g, '``');
        await sequelize.query(`ALTER TABLE \`ppob_orders\` DROP FOREIGN KEY \`${safeName}\``);
      }

      const type = parentId.Type.replace(/[^a-zA-Z0-9(), ]/g, '');
      const charset = parentId.Charset ? ` CHARACTER SET ${parentId.Charset}` : '';
      const collation = parentId.Collation ? ` COLLATE ${parentId.Collation}` : '';
      await sequelize.query(`ALTER TABLE \`ppob_orders\` MODIFY COLUMN \`user_id\` ${type}${charset}${collation} NULL`);

    }

    const [currentConstraints] = await sequelize.query(
      "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ppob_orders' AND COLUMN_NAME = 'user_id' AND REFERENCED_TABLE_NAME = 'users' AND REFERENCED_COLUMN_NAME = 'id'",
    );
    if (!currentConstraints.length) {
      await sequelize.query(
        'ALTER TABLE `ppob_orders` ADD CONSTRAINT `ppob_orders_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE',
      );
    }
  }

  const columns = [
    ['guest_access_token_hash', 'CHAR(64) NULL'],
    ['buyer_name', 'VARCHAR(120) NULL'],
    ['buyer_email', 'VARCHAR(254) NULL'],
    ['buyer_phone', 'VARCHAR(32) NULL'],
    ['quote_expires_at', 'DATETIME NULL'],
    ['last_provider_check_at', 'DATETIME NULL'],
  ];
  for (const [name, definition] of columns) {
    const [found] = await sequelize.query(`SHOW COLUMNS FROM \`ppob_orders\` LIKE '${name}'`);
    if (!found.length) await sequelize.query(`ALTER TABLE \`ppob_orders\` ADD COLUMN \`${name}\` ${definition}`);
  }

  await sequelize.query('UPDATE `ppob_orders` SET `quote_expires_at` = DATE_ADD(`created_at`, INTERVAL 15 MINUTE) WHERE `quote_expires_at` IS NULL');
  await sequelize.query('ALTER TABLE `ppob_orders` MODIFY COLUMN `quote_expires_at` DATETIME NOT NULL');

  const [statusColumns] = await sequelize.query("SHOW COLUMNS FROM `ppob_orders` LIKE 'status'");
  if (statusColumns.length && !statusColumns[0].Type.includes('creating_payment')) {
    await sequelize.query("ALTER TABLE `ppob_orders` MODIFY COLUMN `status` ENUM('quoted','creating_payment','awaiting_payment','processing','pending','success','failed','expired') NOT NULL DEFAULT 'quoted'");
  }
}

module.exports = { ensurePpobGuestSchema };
