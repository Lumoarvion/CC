# Login Limiter Persistence

## Goal
Keep the existing per-account lockout semantics while making the limiter usable across multiple API instances.

## Storage Choice
Redis covers the requirements best: atomic increments, expirations, and broad ops support. We can connect with `redis@^4` using TLS/password when deployed. No new infra primitives are introduced if we already depend on Redis for queues or caching.

## Data Model
- **Key pattern**: `login:fail:<userId>`.
- **Value**: JSON with `tries` array (ISO ms timestamps) and optional `lockUntil` epoch ms.
- **TTL**: 24h to auto-clean stale entries; refresh after each mutation.

This mirrors the in-memory structure so we can swap stores with minimal behavioural change.

## API Shape
Keep the exported functions async to support Redis, but provide sync wrappers for current call sites.

```js
export async function isLockedAsync(userId) {}
export async function recordFailureAsync(userId) {}
export async function clearFailuresAsync(userId) {}

export function isLocked(userId) {
  return syncFallback(isLockedAsync(userId));
}
// same for recordFailure / clearFailures
```

`syncFallback` resolves immediately when the promise is already settled (in-memory mode) and throws a descriptive error if async Redis is used without awaiting. During migration we flip the controller to `await` the async versions to avoid foot-guns.

## Redis Operations
1. **recordFailure**
   - `MULTI`: fetch JSON via `GET`, prune timestamps older than 15 min, push `Date.now()`, and decide whether to set `lockUntil`.
   - `SET` with `PX` TTL 24h.
2. **isLocked**
   - `GET` -> compute remaining lock, optionally clear expired lock by rewriting without `lockUntil`.
3. **clearFailures**
   - `DEL` the key.

## Config
- `LOGIN_LIMITER_REDIS_URL` for connection string.
- Optional overrides: `LOGIN_LIMITER_PREFIX`, reuse the existing `LOGIN_MAX_FAILS_15M`, `LOGIN_LOCK_MIN`.

We lazy-load the Redis client and fall back to the in-memory Map when the URL is missing or the connection errors out (log a warning, continue in dev).

## Rollout Plan
1. Ship the async-capable limiter while keeping controllers synchronous via adapters.
2. Add Redis dependency and connection helper (shared with other infra if present).
3. Update `authController.login` to `await` the async methods.
4. Smoke-test: script brute-force attempts and assert lock/unlock across two API processes.

## Open Questions
- Do we need cross-region support? If so, use managed Redis with cross-AZ replication.
- Should lock state survive user deletion? Currently `DEL` on account removal could clear the key.
- Observability: we can expose `loginLimiter` metrics by counting lock events, storing them in logs or Prometheus.
