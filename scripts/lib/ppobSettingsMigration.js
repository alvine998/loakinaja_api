const { env } = require('../../src/config/env');
const { PpobSetting } = require('../../src/models');

async function ensurePpobSettingsSchema() {
  await PpobSetting.findOrCreate({
    where: { key: 'markup_rupiah' },
    defaults: { value: Math.max(0, env.digiflazz.markup) },
  });
}

module.exports = { ensurePpobSettingsSchema };
