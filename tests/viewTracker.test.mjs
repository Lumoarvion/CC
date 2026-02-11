import assert from 'assert';
import { trackViews, getViewConfig } from '../src/utils/viewTracker.js';

async function run() {
  // Config defaults
  const cfg = getViewConfig();
  assert.ok(cfg.enabled === true, 'POST_VIEWS_ENABLED should default to true');
  assert.ok(cfg.ttlSeconds > 0 && cfg.ttlSeconds <= 86400, 'TTL should be within 1..86400');

  // Basic dedupe flow
  const userId = 1;
  const postIds = [10, 11, 11, 12];
  let inc = await trackViews({ viewerId: userId, postIds });
  assert.deepStrictEqual(new Set(inc), new Set([10, 11, 12]), 'first call should mark all unique ids');

  // Second call within TTL should return empty
  inc = await trackViews({ viewerId: userId, postIds });
  assert.deepStrictEqual(inc || [], [], 'second call should be deduped');

  // Different user should still count
  inc = await trackViews({ viewerId: 2, postIds: [10] });
  assert.deepStrictEqual(inc, [10], 'different user should get counted');

  console.log('viewTracker tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
