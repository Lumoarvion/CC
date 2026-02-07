Project Notes and App Flow

Session: 2025-08-31

Overview
- Entry: `src/server.js` connects DB (`src/db.js`), loads `src/models/index.js`, seeds defaults (roles, departments, degrees, staff designations), verifies SMTP, and starts Express on `PORT`.
- App: `src/app.js` sets up `cors`, `helmet`, `express.json`, `morgan`, serves `/uploads`, and mounts `/api` routes.

Routes
- `src/routes/index.js`: GET `/api/health`; mounts `/api/auth`, `/api/users`, `/api/posts`.
- Auth (`src/routes/authRoutes.js`):
  - POST `/api/auth/register` → `src/controllers/authController.js:register` (requires `degreeId`; optional `roleId`, defaults to Student).
  - POST `/api/auth/login` → `authController.js:login` (accepts `emailOrUsername`, `password`; returns JWT).
  - POST `/api/auth/request-otp` and `/api/auth/verify-otp` → `src/controllers/Reg/Auth.js` (OTP via `AccountOtp`, domain allowlist via `utils/domain.js`, and email via `utils/mailer.js`).
- Users (`src/routes/userRoutes.js`, protected by `src/middleware/auth.js`):
  - GET `/api/users/me` → current user profile.
  - GET `/api/users/:id` → public profile.
  - POST `/api/users/:id/follow`, DELETE `/api/users/:id/follow` → follow/unfollow.
  - POST `/api/users/me/avatar` (multipart, `upload.single('avatar')`) → process to WebP (256/1024px).
  - DELETE `/api/users/me/avatar` → remove avatar files and clear URLs.
- Posts (`src/routes/postRoutes.js`, protected):
  - POST `/api/posts/` → create post.
  - GET `/api/posts/feed` → feed of self + following.
  - POST `/api/posts/:id/like`, DELETE `/api/posts/:id/like` → like/unlike.
  - POST `/api/posts/:id/comments` → add comment.
  - POST `/api/posts/:id/archive`  archive (owner/admin); clears feed visibility without deleting.
  - POST `/api/posts/:id/restore`  undo archive.
  - DELETE `/api/posts/:id` - hard delete (owner/admin).
  - POST `/api/admin/announcements` - create announcement (admin/super-admin).
  - GET `/api/admin/announcements` - list announcements with optional archived filter.
  - PATCH `/api/admin/announcements/:id` - update announcement content/type/schedule.

Middleware
- `src/middleware/auth.js`: Verifies Bearer JWT (`JWT_SECRET`) and sets `req.user.id`.

Models and Relations
- Defined in `src/models/*.js`, wired in `src/models/index.js` (Users ↔ Posts/Comments/Likes/Follows; Degree ↔ Users; Admin tables like `AllowedDomain`, `AccountOtp`, `Role`, `Department`, `StaffDesignation`).
- `User` requires `degreeId` and stores `passwordHash`; supports `avatarUrl` and `avatarUrlFull`.

Seeding and Utilities
- Roles: `src/utils/seeddefaults.js` (`ensureDefaultRoles`).
- Departments: `src/utils/Departmentseeder.js`.
- Degrees: `src/utils/Degreeseeder.js`.
- Staff Designations: `src/utils/StaffDesignationseeder.js`.
- Domain allowlist + brand extraction: `src/utils/domain.js`.
- Mailer + templates: `src/utils/mailer.js`, `src/utils/EmailTemplates/OtpEmail.js`.
- Uploads (avatars): `src/utils/upload.js` creates `uploads/avatars` and enforces 2MB image limit.

Environment
- Database: Postgres via Sequelize; `sequelize.sync({ alter: true })` on boot.
- Required env: `DB_*`, `JWT_SECRET`, SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`).
  - Optional env: `DELETE_OTP_TTL_MIN` (minutes before delete OTP expires, default 15).

Observations / Potential Fixes
- `src/models/Role.js`: check object structure for `roleKey` definition; seeder uses numeric `roleKey` but model defines it as string. Align types and fix any stray braces.
- Ensure at least one `AllowedDomain` row exists to pass OTP domain checks.
- Consider adding rate limits to OTP endpoints and login.

Next TODOs
- Seed `AllowedDomain` with permitted domains (e.g., `example.com`).
- Validate `Role` model shape and `roleKey` type; update seeder if needed.
- Add request validation (e.g., zod/joi) to auth/user routes.
- Add tests for auth and OTP flows if test harness exists.

How to Resume
- Continue from this file (`DEV_NOTES.md`) for a quick refresher.
- Open: `src/server.js`, `src/app.js`, and route/controller files referenced above when changing flow.

------------------------------------------------------------
Updates (latest)

- Role model fixed: `roleKey` → INTEGER, unique index; malformed braces corrected (`src/models/Role.js`).
- AllowedDomain: PK changed to auto-increment INT (`src/models/AllowedDomain.js`); added `ensureAllowedDomains` seeder for `gmail.com` and wired first-run seeding.
- First-run seeding orchestrator: `src/startup/initializeFirstRun.js` seeds Roles, Departments, Degrees, StaffDesignations, AllowedDomains only when each table is empty; called from `src/server.js`.
- Degree/Department required FKs on User: associations set to `allowNull: false` with `onDelete: 'RESTRICT'` for Degree and Department (many Users per Degree/Department). Added `departmentId` to `User` and removed legacy `department` string (`src/models/User.js`, `src/models/index.js`).
- Auth register flow: accepts `roleKey`, resolves Role by `roleKey`; resolves Degree by `degreeId` (business) and Department by `departmentId` (business); stores PKs (`deg.id`, `dept.id`) in `User` (`src/controllers/authController.js`).
- Swagger (OpenAPI):
  - Code-first via JSDoc + swagger-jsdoc + swagger-ui-express; docs mounted only if `ENABLE_API_DOCS=true` (`src/app.js`, `src/docs/swagger.js`).
  - Auto-generation added with `swagger-autogen`; generator script writes `docs/openapi.json` and UI prefers that spec if present (`scripts/generate-openapi.mjs`).
  - NPM scripts: `npm run docs:gen`, `npm run dev:docs`. Access: `/api/docs`, `/api/openapi.json`.
  - Removed static spec to avoid confusion.
- Account deletion flow: added OTP-backed request/confirm endpoints (`src/controllers/userDeleteController.js`), soft-delete fields + jwtVersion checks (`src/models/User.js`, `src/controllers/authController.js`, `src/middleware/auth.js`), archival snapshots (`src/models/UserDeleteArchive.js`), and email templates (`src/utils/mailer.js`, `src/utils/EmailTemplates/DeleteAccountEmail.js`).
- Username validation tightened: register now trims whitespace, enforces 3-30 characters with letters/numbers/dot/underscore/hyphen only, and returns 400/409 before hitting DB; Swagger examples updated with valid/invalid handles.
- Post media overhaul: both standard posts and announcements now rely solely on `PostMedia` attachments (up to 4 images or a single GIF/video); the legacy `Post.imageUrl` column/field was removed (`src/controllers/postController.js`, `src/controllers/announcementController.js`, `src/utils/postMedia.js`).

Next Session TODOs
- Swagger coverage: annotate `userRoutes` and `postRoutes` or rely on `swagger-autogen` and add hints for request bodies where needed.
- Auth controller: include `departmentId` in login response for symmetry; simplify role fallback (numeric only).
- Meta endpoints: add `GET /api/meta/roles|degrees|departments` to let clients discover valid business IDs.
- Env hardening: fail fast if `DB_*`, `JWT_SECRET`, or SMTP vars missing.
- Rate limiting: add basic limiter for `/auth/login` and `/auth/request-otp`.
- Seeder top-up: optionally run idempotent seeding every start to insert newly added defaults.

Commands
- Install new deps: `npm install`
- Generate docs: `ENABLE_API_DOCS=true npm run docs:gen`
- Run with docs: `ENABLE_API_DOCS=true npm run dev` (or `npm run dev:docs` for one-shot generate + dev)



