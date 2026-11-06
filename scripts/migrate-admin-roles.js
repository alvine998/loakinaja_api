const sequelize = require('../src/config/database');
require('../src/models');
const { ensureAdminRolesSchema } = require('./lib/adminRolesMigration');

async function migrate() {
  await sequelize.authenticate();
  await sequelize.sync();
  await ensureAdminRolesSchema(sequelize);
  console.log('Admin role migration complete.');
}

migrate()
  .catch((error) => {
    console.error('Admin role migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => sequelize.close());
