import crypto from 'crypto';
import dotenv from 'dotenv';
import { getRedis } from './redisClient.js';
dotenv.config();

// Config
const ENABLED = process.env.POST_VIEWS_ENABLED !== 'false';
const CAP = Number(process.env.POST_VIEWS_PER_REQUEST_CAP || 50);
const ttlInput = process.env.POST_VIEWS_TTL || '24h';

function parseTtlHours(raw) {
  const trimmed = String(raw || '').trim().toLowerCase();
  const match = trimmed.match(/^(\d+)\s*h?$/);
  if (!match) return 24 * 3600;
  const hours = Math.max(1, Math.min(24, Number(match[1]) || 24));
  return hours * 3600;
}

const TTL_SECONDS = parseTtlHours(ttlInput);

// Simple in-memory TTL store (single-instance fallback)
const memStore = new Map();
function memGet(key) {
  const entry = memStore.get(key);
  if (!entry) return false;
  if (entry.expiresAt <= Date.now()) {
    memStore.delete(key);
    return false;
  }
  return true;
}
function memSet(key, ttlSec) {
  const expiresAt = Date.now() + ttlSec * 1000;
  memStore.set(key, { expiresAt });
}

// Helper to cap IDs list
function capIds(ids) {
  if (!Array.isArray(ids)) return [];
  if (ids.length <= CAP) return ids;
  return ids.slice(0, CAP);
}

function buildKey(postId, userId) {
  return `view:${postId}:user:${userId}`;
}

async function trackWithRedis(ids, viewerId) {
  const redis = await getRedis();
  if (!redis) return null;
  const keys = ids.map((id) => buildKey(id, viewerId));
  const pipeline = redis.multi();
  keys.forEach((k) => pipeline.exists(k));
  const existsResults = await pipeline.exec();
  const toSet = [];
  const toIncrement = [];
  existsResults.forEach((res, idx) => {
    const exists = Array.isArray(res) ? res[1] : res; // redis v4 returns [err, result] or just result
    if (!exists) {
      toIncrement.push(ids[idx]);
      toSet.push(keys[idx]);
    }
  });
  if (toSet.length) {
    const setPipe = redis.multi();
    toSet.forEach((k) => setPipe.set(k, '', { EX: TTL_SECONDS, NX: true }));
    await setPipe.exec();
  }
  return toIncrement;
}

async function trackWithMemory(ids, viewerId) {
  const toIncrement = [];
  for (const id of ids) {
    const key = buildKey(id, viewerId);
    const seen = memGet(key);
    if (!seen) {
      toIncrement.push(id);
      memSet(key, TTL_SECONDS);
    }
  }
  return toIncrement;
}

export async function trackViews({ viewerId, postIds }) {
  if (!ENABLED) return [];
  const unique = Array.from(new Set(postIds.filter((id) => Number.isInteger(id) && id > 0)));
  const ids = capIds(unique);
  if (!ids.length) return [];

  const viaRedis = await trackWithRedis(ids, viewerId);
  if (viaRedis) return viaRedis;
  return trackWithMemory(ids, viewerId);
}

export function getViewConfig() {
  return { enabled: ENABLED, ttlSeconds: TTL_SECONDS, cap: CAP };
}
