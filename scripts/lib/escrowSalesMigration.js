const COLUMNS = [
  ['listing_title', 'VARCHAR(160) NULL'],
  ['buyer_name', 'VARCHAR(120) NULL'],
  ['seller_name', 'VARCHAR(120) NULL'],
  ['escrow_bank_name', 'VARCHAR(80) NULL'],
  ['escrow_account_number', 'VARCHAR(64) NULL'],
  ['escrow_account_holder', 'VARCHAR(120) NULL'],
  ['paid_at', 'DATETIME NULL'],
  ['released_at', 'DATETIME NULL'],
];

async function ensureEscrowSalesSchema(sequelize) {
  const [tables] = await sequelize.query("SHOW TABLES LIKE 'escrow_sales'");
  if (!tables.length) return;

  for (const [name, definition] of COLUMNS) {
    const [columns] = await sequelize.query(`SHOW COLUMNS FROM \`escrow_sales\` LIKE '${name}'`);
    if (!columns.length) {
      await sequelize.query(`ALTER TABLE \`escrow_sales\` ADD COLUMN \`${name}\` ${definition}`);
    }
  }

  const [statusColumns] = await sequelize.query("SHOW COLUMNS FROM `escrow_sales` LIKE 'status'");
  if (statusColumns.length) {
    await sequelize.query("ALTER TABLE `escrow_sales` MODIFY COLUMN `status` ENUM('awaiting_payment', 'payment_submitted', 'in_escrow', 'release_requested', 'released', 'cancelled') NOT NULL DEFAULT 'awaiting_payment'");
  }

  await sequelize.query(
    'UPDATE `escrow_sales` AS `sale` LEFT JOIN `listings` AS `listing` ON `listing`.`id` = `sale`.`listing_id` LEFT JOIN `users` AS `buyer` ON `buyer`.`id` = `sale`.`buyer_id` LEFT JOIN `users` AS `seller` ON `seller`.`id` = `sale`.`seller_id` SET `sale`.`listing_title` = COALESCE(`sale`.`listing_title`, `listing`.`title`), `sale`.`buyer_name` = COALESCE(`sale`.`buyer_name`, `buyer`.`name`), `sale`.`seller_name` = COALESCE(`sale`.`seller_name`, `seller`.`name`)',
  );
}

module.exports = { ensureEscrowSalesSchema };
