const { createClient } = require('redis');
const { env } = require('../config/env');

let client;
let connecting;
let disabled = false;

function destroyClient(target) {
  if (!target?.isOpen) return;
  try {
    target.destroy();
  } catch {}
}

async function getClient() {
  if (!env.redis.url || disabled) return null;
  if (client?.isReady) return client;
  if (connecting) return connecting;

  client = createClient({
    url: env.redis.url,
    socket: {
      connectTimeout: 3000,
      reconnectStrategy: (retries) => retries >= 2 ? false : 500,
    },
  });
  client.on('error', (error) => {
    console.error('Redis connection error:', error.message);
  });
  client.on('end', () => {
    if (disabled) return;
    console.warn('Redis connection closed; using database cache fallback.');
    disabled = true;
    client = null;
  });

  connecting = client.connect()
    .then(() => client)
    .catch((error) => {
      console.error('Could not connect to Redis; using database cache fallback:', error.message);
      disabled = true;
      destroyClient(client);
      client = null;
      return null;
    })
    .finally(() => { connecting = null; });
  return connecting;
}

async function close() {
  if (client?.isOpen) {
    await client.quit().catch(() => destroyClient(client));
  }
  client = null;
  connecting = null;
}

module.exports = { getClient, close };
