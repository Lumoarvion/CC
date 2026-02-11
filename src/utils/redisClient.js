import { createClient } from 'redis';

let client = null;
let tried = false;

export async function getRedis() {
  if (client) return client;
  if (tried) return null;
  tried = true;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    client = createClient({ url });
    client.on('error', (err) => {
      console.error('Redis client error', err);
    });
    await client.connect();
    return client;
  } catch (err) {
    console.error('Redis connect failed, falling back to memory cache', err?.message || err);
    client = null;
    return null;
  }
}
