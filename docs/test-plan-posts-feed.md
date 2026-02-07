# Post & Feed API Test Plan

This plan summarizes the automated checks now available for the post creation and feed retrieval APIs, plus the manual/load steps required to validate throughput and latency.

## Automated functional coverage

| Area | Test case | File / reference |
| --- | --- | --- |
| Create post | Successful creation with sanitized content, ensures 201 response and serialized payload | `tests/post-controller.test.js` › `createPost succeeds with valid content` |
| Create post | Rejects blank content with 400 | same file |
| Create post | Enforces per‑minute rate limiter (429) | same file |
| Create post | Blocks duplicate content (409) | same file |
| Create post | Validates numeric quotedPostId (400) | same file |
| Create post | Returns 404 when quoted post not found | same file |
| Feed | Aggregates follow + interest buckets and surfaces announcements | `tests/feed-endpoint.test.js` › `feed aggregates…` |
| Feed | Falls back to department/degree buckets and paginates correctly | same file |

Run the suite:

```bash
node --test tests/post-controller.test.js tests/feed-endpoint.test.js
```

These tests stub Sequelize calls so they run without touching the real database.

## Manual / exploratory scenarios

1. **Post creation end-to-end**
   - Create text-only post, post with attachments, quotes, and replies via the REST client or Swagger UI.
   - Attempt invalid payloads (empty content, overly long, malformed attachment metadata).
2. **Feed behavior**
   - Confirm posts disappear when archived/deleted, reappear on restore.
   - Validate deduping when the same post qualifies for multiple buckets.
   - Check `announcements` array always present and excludes expired pins.
3. **Auth edges**
   - Hit endpoints with expired tokens, disabled accounts, or insufficient roles to ensure 401/403 responses.

## Load testing

Use the Artillery scenario in `tests/load/posts-feed-load.yml` to stress POST and GET endpoints simultaneously.

### Prerequisites
1. Running API server (e.g., `npm run dev`) with seed data that includes follow relationships, departments, degrees, and at least one active announcement.
2. Obtain a valid JWT for a test user and export it:
   ```bash
   set AUTH_TOKEN=eyJhbGciOiJI...
   set TARGET=http://localhost:4000/api
   ```

### Execute load test

```bash
npx artillery@latest run tests/load/posts-feed-load.yml \
  --target "%TARGET%" \
  --overrides "{ \"config\": { \"phases\": [{\"duration\":60,\"arrivalRate\":5},{\"duration\":120,\"arrivalRate\":20,\"rampTo\":40}] }}" \
  --variables "{ \"authToken\": \"%AUTH_TOKEN%\" }"
```

_Key metrics_: median/P95 latency for both requests, error rate, and the `bucketStats` logged by the API to ensure bucket allocation remains healthy under load. Scale the phases up once the baseline stays below agreed SLAs (e.g., <150 ms P95 for feed, <200 ms for post creation).

Document test results (dates, configs, findings) in `docs/session-notes-*.md` after each run.
