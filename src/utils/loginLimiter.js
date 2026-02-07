// In-memory login rate limiter (per-account)
// Uses a sliding window of 15 minutes and locks account for configured minutes after threshold.

const failures = new Map(); // userId -> { tries: number[], lockUntil: number|null }

function now() {
  return Date.now();
}

function getConfig() {
  const maxFails = Number(process.env.LOGIN_MAX_FAILS_15M || 5);
  const lockMin = Number(process.env.LOGIN_LOCK_MIN || 15);
  const windowMs = 15 * 60 * 1000;
  return { maxFails, lockMin, windowMs };
}

export function isLocked(userId) {
  const rec = failures.get(userId);
  if (!rec || !rec.lockUntil) return { locked: false, retryAfterSec: 0 };
  const ms = rec.lockUntil - now();
  if (ms > 0) return { locked: true, retryAfterSec: Math.ceil(ms / 1000) };
  // Expired lock; clear
  rec.lockUntil = null;
  failures.set(userId, rec);
  return { locked: false, retryAfterSec: 0 };
}

export function recordFailure(userId) {
  const { maxFails, lockMin, windowMs } = getConfig();
  const ts = now();
  let rec = failures.get(userId);
  if (!rec) rec = { tries: [], lockUntil: null };
  // Evict old tries
  rec.tries = rec.tries.filter((t) => ts - t < windowMs);
  rec.tries.push(ts);
  // Lock if threshold reached
  let justLocked = false;
  const countAfter = rec.tries.length;
  if (countAfter >= maxFails) {
    rec.lockUntil = ts + lockMin * 60 * 1000;
    rec.tries = []; // reset after lock
    justLocked = true;
  }
  failures.set(userId, rec);
  return { justLocked, retryAfterSec: rec.lockUntil ? Math.ceil((rec.lockUntil - ts) / 1000) : 0, count: countAfter };
}

export function clearFailures(userId) {
  failures.delete(userId);
}

// For diagnostics/testing only
export function _stats(userId) {
  return failures.get(userId) || { tries: [], lockUntil: null };
}
