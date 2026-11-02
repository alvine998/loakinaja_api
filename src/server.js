const app = require('./app');
const sequelize = require('./config/database');
const { env, validateEnv } = require('./config/env');
require('./models');

async function start() {
  validateEnv();
  await sequelize.authenticate();
  // Creates missing tables for a fresh install. Use migrations for production schema changes.
  await sequelize.sync();

  const server = app.listen(env.port, () => {
    console.log(`LoakinAja API listening on http://localhost:${env.port}`);
  });

  const shutdown = async () => {
    server.close(async () => {
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
