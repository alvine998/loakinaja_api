const sequelize = require('../config/database');
const { randomUUID } = require('node:crypto');
const { PpobCatalog } = require('../models');
const digiflazz = require('./digiflazz');
const redis = require('./redis');

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const FAILURE_RETRY_MS = 30 * 1000;
const REDIS_CACHE_TTL_SECONDS = 60 * 60;
const REDIS_LOCK_TTL_SECONDS = 90;
const REFRESH_WAIT_MS = 22_000;
const REFRESH_POLL_MS = 500;
const catalogTypes = ['prepaid', 'postpaid'];
let refreshTimer;
const inFlightRefreshes = new Map();

function redisKeys(type) {
  return { cache: `loakinaja:ppob:catalog:${type}`, lock: `loakinaja:ppob:catalog:${type}:refresh-lock` };
}

async function readRedisSnapshot(type) {
  const client = await redis.getClient();
  if (!client) return null;
  try {
    const value = await client.get(redisKeys(type).cache);
    if (!value) return null;
    const snapshot = JSON.parse(value);
    if (!Array.isArray(snapshot.products) || !Number.isFinite(Date.parse(snapshot.fetchedAt))) return null;
    return { products: snapshot.products, fetchedAt: new Date(snapshot.fetchedAt) };
  } catch (error) {
    console.error(`Could not read Redis ${type} catalog cache:`, error.message);
    return null;
  }
}

async function writeRedisSnapshot(type, products, fetchedAt) {
  const client = await redis.getClient();
  if (!client) return;
  try {
    await client.set(redisKeys(type).cache, JSON.stringify({ products, fetchedAt }), { EX: REDIS_CACHE_TTL_SECONDS });
  } catch (error) {
    console.error(`Could not write Redis ${type} catalog cache:`, error.message);
  }
}

async function readSnapshot(type) {
  const redisSnapshot = await readRedisSnapshot(type);
  if (redisSnapshot && Date.now() - new Date(redisSnapshot.fetchedAt).getTime() < REFRESH_INTERVAL_MS) return redisSnapshot;
  const snapshot = await PpobCatalog.findByPk(type);
  if (!snapshot) return null;
  const result = {
    products: snapshot.products,
    fetchedAt: snapshot.fetchedAt,
  };
  if (Array.isArray(result.products) && Date.now() - new Date(result.fetchedAt).getTime() < REFRESH_INTERVAL_MS) {
    await writeRedisSnapshot(type, result.products, result.fetchedAt);
  }
  return result;
}

async function refreshFromDatabase(type) {
  const claim = await sequelize.transaction(async (transaction) => {
    const snapshot = await PpobCatalog.findByPk(type, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!snapshot) throw new Error(`Digiflazz ${type} catalog row is missing`);

    if (Date.now() - new Date(snapshot.fetchedAt).getTime() < REFRESH_INTERVAL_MS) {
      return { refreshed: false, products: snapshot.products, fetchedAt: snapshot.fetchedAt };
    }

    if (snapshot.lastAttemptAt && Date.now() - new Date(snapshot.lastAttemptAt).getTime() < FAILURE_RETRY_MS) {
      return {
        refreshed: false,
        reason: 'cooldown',
        retryAfterMs: FAILURE_RETRY_MS - (Date.now() - new Date(snapshot.lastAttemptAt).getTime()),
        products: snapshot.products,
        fetchedAt: snapshot.fetchedAt,
      };
    }

    await snapshot.update({ lastAttemptAt: new Date() }, { transaction });
    return { refreshed: true };
  });

  if (!claim.refreshed) return claim;

  const products = await digiflazz.getPriceList(type);
  const fetchedAt = new Date();
  await PpobCatalog.update({ products, fetchedAt, lastAttemptAt: fetchedAt }, { where: { type } });
  await writeRedisSnapshot(type, products, fetchedAt);
  return { refreshed: true, products, fetchedAt };
}

async function refreshOnce(type) {
  const client = await redis.getClient();
  if (!client) return refreshFromDatabase(type);

  const lockKey = redisKeys(type).lock;
  const lockToken = randomUUID();
  let lockAcquired = false;
  try {
    try {
      lockAcquired = await client.set(lockKey, lockToken, { NX: true, EX: REDIS_LOCK_TTL_SECONDS }) === 'OK';
    } catch (error) {
      console.error(`Could not acquire Redis ${type} catalog refresh lock; using database lock:`, error.message);
      return await refreshFromDatabase(type);
    }
    if (!lockAcquired) return { refreshed: false, reason: 'in_progress', ...(await readSnapshot(type)) };
    const claim = await sequelize.transaction(async (transaction) => {
      const snapshot = await PpobCatalog.findByPk(type, { transaction, lock: transaction.LOCK.UPDATE });
      if (!snapshot) throw new Error(`Digiflazz ${type} catalog row is missing`);
      if (Date.now() - new Date(snapshot.fetchedAt).getTime() < REFRESH_INTERVAL_MS) {
        return { refreshed: false, products: snapshot.products, fetchedAt: snapshot.fetchedAt };
      }
      if (snapshot.lastAttemptAt && Date.now() - new Date(snapshot.lastAttemptAt).getTime() < FAILURE_RETRY_MS) {
        return {
          refreshed: false,
          reason: 'cooldown',
          retryAfterMs: FAILURE_RETRY_MS - (Date.now() - new Date(snapshot.lastAttemptAt).getTime()),
          products: snapshot.products,
          fetchedAt: snapshot.fetchedAt,
        };
      }
      await snapshot.update({ lastAttemptAt: new Date() }, { transaction });
      return { refreshed: true };
    });
    if (!claim.refreshed) return claim;
    const products = await digiflazz.getPriceList(type);
    const fetchedAt = new Date();
    await PpobCatalog.update({ products, fetchedAt, lastAttemptAt: fetchedAt }, { where: { type } });
    await writeRedisSnapshot(type, products, fetchedAt);
    return { refreshed: true, products, fetchedAt };
  } finally {
    if (lockAcquired) {
      await client.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", {
        keys: [lockKey], arguments: [lockToken],
      }).catch((error) => console.error(`Could not release Redis ${type} catalog refresh lock:`, error.message));
    }
  }
}

function refresh(type) {
  const existing = inFlightRefreshes.get(type);
  if (existing) return existing;
  const pending = refreshOnce(type).finally(() => {
    if (inFlightRefreshes.get(type) === pending) inFlightRefreshes.delete(type);
  });
  inFlightRefreshes.set(type, pending);
  return pending;
}

async function waitForRefresh(type, previousFetchedAt) {
  const deadline = Date.now() + REFRESH_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, REFRESH_POLL_MS));
    const snapshot = await readSnapshot(type);
    if (snapshot && new Date(snapshot.fetchedAt).getTime() > previousFetchedAt) return snapshot;
  }
  return null;
}

async function getProducts(type) {
  const snapshot = await readSnapshot(type);
  if (snapshot && Array.isArray(snapshot.products) && Date.now() - new Date(snapshot.fetchedAt).getTime() < REFRESH_INTERVAL_MS) {
    return snapshot.products;
  }
  try {
    const refreshed = await refresh(type);
    if (refreshed?.products && new Date(refreshed.fetchedAt).getTime() > 0) return refreshed.products;
    if (snapshot && Array.isArray(snapshot.products) && snapshot.products.length > 0) {
      console.warn(`Digiflazz ${type} catalog refresh is unavailable; serving stale snapshot.`);
      return snapshot.products;
    }
    if (refreshed?.reason === 'in_progress') {
      const completed = await waitForRefresh(type, new Date(snapshot?.fetchedAt || 0).getTime());
      if (completed) return completed.products;
    }
    const retryAfterMs = refreshed?.retryAfterMs || 2000;
    const error = new Error(refreshed?.reason === 'in_progress'
      ? `Digiflazz ${type} catalog is still loading; retry in a few seconds`
      : `Digiflazz ${type} catalog is temporarily unavailable; retry shortly`);
    error.status = 503;
    error.code = 'PPOB_CATALOG_REFRESHING';
    error.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    throw error;
  } catch (error) {
    if (snapshot && Array.isArray(snapshot.products) && snapshot.products.length > 0 && new Date(snapshot.fetchedAt).getTime() > 0) {
      console.error(`Digiflazz ${type} catalog refresh failed; using saved snapshot:`, error.message);
      return snapshot.products;
    }
    throw error;
  }
}

async function refreshStaleCatalogs() {
  await Promise.all(catalogTypes.map(async (type) => {
    const snapshot = await readSnapshot(type);
    if (snapshot && Array.isArray(snapshot.products) && Date.now() - new Date(snapshot.fetchedAt).getTime() < REFRESH_INTERVAL_MS) return;

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

module.exports = { getProducts, start, refreshStaleCatalogs, REFRESH_INTERVAL_MS };
