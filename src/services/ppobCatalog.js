const sequelize = require('../config/database');
const { PpobCatalog } = require('../models');
const digiflazz = require('./digiflazz');

const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const catalogTypes = ['prepaid', 'postpaid'];
let refreshTimer;

async function readSnapshot(type) {
  const snapshot = await PpobCatalog.findByPk(type);
  if (!snapshot) return null;
  return {
    products: snapshot.products,
    fetchedAt: snapshot.fetchedAt,
  };
}

async function refresh(type) {
  const claim = await sequelize.transaction(async (transaction) => {
    const snapshot = await PpobCatalog.findByPk(type, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!snapshot) throw new Error(`Digiflazz ${type} catalog row is missing`);

    if (Date.now() - new Date(snapshot.fetchedAt).getTime() < REFRESH_INTERVAL_MS) {
      return { refreshed: false, products: snapshot.products, fetchedAt: snapshot.fetchedAt };
    }

    if (snapshot.lastAttemptAt && Date.now() - new Date(snapshot.lastAttemptAt).getTime() < REFRESH_INTERVAL_MS) {
      return { refreshed: false, products: snapshot.products, fetchedAt: snapshot.fetchedAt };
    }

    await snapshot.update({ lastAttemptAt: new Date() }, { transaction });
    return { refreshed: true };
  });

  if (!claim.refreshed) return claim;

  const products = await digiflazz.getPriceList(type);
  const fetchedAt = new Date();
  await PpobCatalog.update({ products, fetchedAt }, { where: { type } });
  return { refreshed: true, products, fetchedAt };
}

async function getProducts(type) {
  const snapshot = await readSnapshot(type);
  if (snapshot && Date.now() - new Date(snapshot.fetchedAt).getTime() < REFRESH_INTERVAL_MS) {
    return snapshot.products;
  }
  try {
    const refreshed = await refresh(type);
    if (new Date(refreshed.fetchedAt).getTime() > 0) return refreshed.products;
    const error = new Error(`Digiflazz ${type} catalog is refreshing; retry shortly`);
    error.status = 503;
    throw error;
  } catch (error) {
    if (snapshot && new Date(snapshot.fetchedAt).getTime() > 0) {
      console.error(`Digiflazz ${type} catalog refresh failed; using saved snapshot:`, error.message);
      return snapshot.products;
    }
    throw error;
  }
}

async function refreshStaleCatalogs() {
  await Promise.all(catalogTypes.map(async (type) => {
    const snapshot = await readSnapshot(type);
    if (snapshot && Date.now() - new Date(snapshot.fetchedAt).getTime() < REFRESH_INTERVAL_MS) return;

    try {
      const result = await refresh(type);
      if (result.refreshed) console.log(`Refreshed Digiflazz ${type} catalog`);
    } catch (error) {
      console.error(`Digiflazz ${type} catalog refresh failed:`, error.message);
    }
  }));
}

async function start() {
  if (refreshTimer) return;
  await Promise.all(catalogTypes.map((type) => PpobCatalog.findOrCreate({
    where: { type },
    defaults: { products: [], fetchedAt: new Date(0), lastAttemptAt: null },
  })));
  void refreshStaleCatalogs();
  refreshTimer = setInterval(() => void refreshStaleCatalogs(), REFRESH_INTERVAL_MS);
  refreshTimer.unref?.();
}

module.exports = { getProducts, start, refreshStaleCatalogs };
