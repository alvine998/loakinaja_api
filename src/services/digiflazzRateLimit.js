const { createHash } = require('node:crypto');
const { env } = require('../config/env');
const redis = require('./redis');

const DEFAULT_MIN_INTERVAL_MS = 1000;
const DEFAULT_COOLDOWN_MS = 30_000;
const accountKey = createHash('sha256').update(env.digiflazz.username || 'unconfigured').digest('hex').slice(0, 16);
const redisKeys = {
  next: `loakinaja:digiflazz:${accountKey}:next-request`,
  cooldown: `loakinaja:digiflazz:${accountKey}:cooldown-until`,
};
const ACQUIRE_SCRIPT = `
local time = redis.call('TIME')
local now = (time[1] * 1000) + math.floor(time[2] / 1000)
local cooldown = tonumber(redis.call('GET', KEYS[2]) or '0')
if cooldown > now then return cooldown - now end
local nextRequest = tonumber(redis.call('GET', KEYS[1]) or '0')
if nextRequest > now then return nextRequest - now end
local interval = tonumber(ARGV[1])
redis.call('SET', KEYS[1], now + interval, 'PX', math.max(interval * 2, 1000))
return 0
`;
const COOLDOWN_SCRIPT = `
local time = redis.call('TIME')
local now = (time[1] * 1000) + math.floor(time[2] / 1000)
local delay = tonumber(ARGV[1])
local untilTime = now + delay
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if untilTime > current then
  redis.call('SET', KEYS[1], untilTime, 'PX', delay)
end
return 0
`;

let nextLocalRequestAt = 0;
let localCooldownUntil = 0;
let localQueue = Promise.resolve();

function minIntervalMs() {
  const value = Number(env.digiflazz.minRequestIntervalMs);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_MIN_INTERVAL_MS;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(1, ms)));
}

async function acquireLocalSlot() {
  let release;
  const previous = localQueue;
  localQueue = new Promise((resolve) => { release = resolve; });
  await previous;
  try {
    while (true) {
      const waitMs = Math.max(localCooldownUntil, nextLocalRequestAt) - Date.now();
      if (waitMs <= 0) break;
      await sleep(waitMs);
    }
    nextLocalRequestAt = Date.now() + minIntervalMs();
  } finally {
    release();
  }
}

async function waitForSlot() {
  const client = await redis.getClient();
  if (!client) return acquireLocalSlot();

  try {
    while (true) {
      const waitMs = Number(await client.eval(ACQUIRE_SCRIPT, {
        keys: [redisKeys.next, redisKeys.cooldown],
        arguments: [String(minIntervalMs())],
      }));
      if (waitMs <= 0) return;
      await sleep(waitMs);
    }
  } catch (error) {
    console.error('Digiflazz shared rate limiter unavailable; using process-local limiter:', error.message);
    return acquireLocalSlot();
  }
}

function parseRetryAfter(value) {
  if (!value) return DEFAULT_COOLDOWN_MS;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1000, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1000, date - Date.now()) : DEFAULT_COOLDOWN_MS;
}

async function deferAfterRateLimit(retryAfter) {
  const delay = parseRetryAfter(retryAfter);
  localCooldownUntil = Math.max(localCooldownUntil, Date.now() + delay);
  const client = await redis.getClient();
  if (!client) return delay;
  try {
    await client.eval(COOLDOWN_SCRIPT, { keys: [redisKeys.cooldown], arguments: [String(delay)] });
  } catch (error) {
    console.error('Could not publish Digiflazz cooldown to Redis:', error.message);
  }
  return delay;
}

module.exports = { waitForSlot, deferAfterRateLimit, DEFAULT_COOLDOWN_MS };
