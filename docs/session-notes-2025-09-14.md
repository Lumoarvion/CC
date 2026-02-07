Session Notes – 2025-09-14

Summary of Changes
- OTP rate limits: per-email/IP hourly caps + 30s cooldown in `src/controllers/Reg/Auth.js` with supporting indexes in AccountOtp.
- Login lockout: 5 fails/15m → 15m lock (429 + Retry-After) via `src/utils/loginLimiter.js` and `src/controllers/authController.js`.
- Register (staff/student): staff now requires `designationId` and `empId` (unique). Stored as FK (`staffDesignationId`) and `emp_id` in `Users`. Implemented in `src/controllers/authController.js` and `src/models/User.js`.
- Logging: request/response logging wrapper for `/auth/register` in `src/routes/authRoutes.js`. Logger timestamps are local-time in `src/utils/logger.js`.
- Swagger: generator updated in `scripts/generate-openapi.mjs` to include `designationId` and `empId` in request/response examples; `docs/openapi.json` regenerated.
- Cleanup: removed temp scripts and ad-hoc server logs under `logs/`.
- Account deletion (soft): OTP-backed request/confirm endpoints (`src/controllers/userDeleteController.js`), user sanitisation fields (`src/models/User.js`), JWT/token invalidation, archive snapshots, and templated emails.

What’s Pending / Next Steps
- Trust proxy: add `app.set('trust proxy', true)` in `src/app.js` if behind a proxy (ensures real IPs for rate limits).
- Migrations (prod): write CREATE INDEX CONCURRENTLY migrations for new indexes (AccountOtp, Users.emp_id) and avoid relying on `sync({ alter: true })`.
- Unique policy: remove redundancy for `emp_id` (choose attribute `unique: true` or model-level unique index) in a migration pass.
- Account deletion rollout: exercise request/confirm flow, document manual cancellation/restore steps, and prep migrations/tests.
- Redis (prod): move login lockout to a shared store for multi-instance deployments.
- Docs: verify Swagger UI reflects `designationId` and `empId` after server restart with `ENABLE_API_DOCS=true`.

How to Resume
- Start API: `npm start` (or `node src/server.js`) — dev uses `sequelize.sync({ alter: true })` to apply schema changes.
- Regenerate docs: `npm run docs:gen` (serves from `docs/openapi.json`).
- Sanity checks: run a staff registration with `designationId` + `empId`; verify 201 and uniqueness (409 on duplicate `empId`).

Notes
- Login limiter is in-memory and per-process; acceptable in dev, switch to Redis for prod.
- Logs are rotated per day under `logs/`, with rotation audit JSON files.

End-of-day Update
- Staff additions: `empId` required for Staff; uniqueness enforced; response now includes `empId`. Association added: `User.belongsTo(StaffDesignation)`; index on `Users.emp_id`.
- Swagger details: Staff request example now includes both `designationId` and `empId`; 201 response example includes `designationId` and `empId`; `UserSummary` extended where applicable.
- Housekeeping:
  - Removed dev-only scripts (`scripts/test-register-*.mjs`, import checks, openapi patchers) and tmp files.
  - Moved `DEV_NOTES.md` → `docs/DEV_NOTES.md`.
  - Added `.gitignore` (ignores `logs/`, `.env`, etc.).
  - Logger retention set to 7 days; confirmed single active audit file remains in `logs/`.
- Known gotchas today that we fixed:
  - Multiple node processes on the same port causing EADDRINUSE; ensure a single server instance when testing.
  - System env overriding lockout thresholds; prefer `.env` or start process with explicit `LOGIN_*` variables for dev tests.

Tomorrow’s Short Plan
1) Add `app.set('trust proxy', true)` in `src/app.js` (if behind proxy).
2) Run delete request/confirm end-to-end, regenerate Swagger, and note manual handling since no cancel/admin overrides exist.
3) Draft production migrations for new indexes/columns; remove redundant unique for `emp_id`.
4) Optional: add Redis-backed login limiter for horizontal scale.

Wrap-up (latest)
- Delete flow exercised next: run request/confirm locally, verify sanitisation, then regenerate Swagger docs with the new endpoints.
- Pre-prod hardening still pending: author Sequelize migrations for new columns/indexes and add OTP/sanitisation integration tests; document manual cancellation procedure since no cancel endpoints exist.
- App currently stopped; restart with `npm run dev` (or `node src/server.js`) when resuming.

