const { env } = require('../config/env');
const { PpobSetting } = require('../models');

async function getMarkup() {
  const setting = await PpobSetting.findByPk('markup_rupiah');
  return setting ? Number(setting.value) : Math.max(0, env.digiflazz.markup);
}

module.exports = { getMarkup };
