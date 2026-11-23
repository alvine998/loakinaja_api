async function ensureColumns(sequelize, tableName) {
  const [tables] = await sequelize.query(`SHOW TABLES LIKE '${tableName}'`);
  if (!tables.length) return;

  const columns = [
    ['ipaymu_session_id', 'VARCHAR(64) NULL'],
    ['ipaymu_transaction_id', 'VARCHAR(64) NULL'],
  ];

  for (const [name, definition] of columns) {
    const [found] = await sequelize.query(`SHOW COLUMNS FROM \`${tableName}\` LIKE '${name}'`);
    if (!found.length) {
      await sequelize.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${name}\` ${definition}`);
    }
  }

  const [indexes] = await sequelize.query(
    `SHOW INDEX FROM \`${tableName}\` WHERE Column_name = 'ipaymu_transaction_id' AND Non_unique = 0`,
  );
  if (!indexes.length) {
    await sequelize.query(
      `ALTER TABLE \`${tableName}\` ADD UNIQUE INDEX \`${tableName}_ipaymu_transaction_id\` (\`ipaymu_transaction_id\`)`,
    );
  }
}

async function ensureIpaymuSchema(sequelize) {
  await ensureColumns(sequelize, 'token_orders');
  await ensureColumns(sequelize, 'ppob_orders');
}

module.exports = { ensureIpaymuSchema };
