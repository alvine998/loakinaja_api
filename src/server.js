const app = require('./app');
const sequelize = require('./config/database');
const { env, validateEnv } = require('./config/env');
require('./models');
const { ensureAdminRolesSchema } = require('../scripts/lib/adminRolesMigration');
const { ensurePpobGuestSchema } = require('../scripts/lib/ppobGuestMigration');
const { ensurePpobCatalogSchema } = require('../scripts/lib/ppobCatalogMigration');
const { ensureGoogleLoginSchema } = require('../scripts/lib/googleLoginMigration');
const { ensureProfilePhotoSchema } = require('../scripts/lib/profilePhotoMigration');
const { ensurePpobSettingsSchema } = require('../scripts/lib/ppobSettingsMigration');
const ppobCatalog = require('./services/ppobCatalog');
const redis = require('./services/redis');

async function start() {
  validateEnv();
  await sequelize.authenticate();
  // Bring existing PPOB tables up to the guest-compatible schema before sync
  // evaluates model foreign keys and attempts any column alterations.
  await ensurePpobGuestSchema(sequelize);
  // Creates missing tables for a fresh install. Use migrations for production schema changes.
  await sequelize.sync();
  // Existing installs need the RBAC column before any admin login/session queries run.
  await ensureAdminRolesSchema(sequelize);
  await ensurePpobCatalogSchema(sequelize);
  await ensureGoogleLoginSchema(sequelize);
  await ensureProfilePhotoSchema(sequelize);
  await ensurePpobSettingsSchema();
  await ppobCatalog.start();

  const server = app.listen(env.port, () => {
    console.log(`LoakinAja API listening on http://localhost:${env.port}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await redis.close();
      await sequelize.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((error) => {
  console.error('Failed to start API:', error.message);
  process.exit(1);
});
