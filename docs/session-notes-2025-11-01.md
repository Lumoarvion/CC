Session Notes - 2025-11-01

Summary of Work
- Removed the legacy `Post.imageUrl` column/usage; posts and announcements now rely entirely on `PostMedia` attachments (`src/models/Post.js`, `src/utils/postMedia.js`, `src/controllers/postController.js`, `src/controllers/announcementController.js`).
- Regenerated OpenAPI docs so request/response schemas reflect attachment-only media payloads (`scripts/generate-openapi.mjs`, `docs/openapi.json`).
- Updated developer notes to capture the media model change (`docs/DEV_NOTES.md`).

Artifacts & Commands
- `npm run docs:gen`

Follow-ups
- Plan a database migration to drop the physical `imageUrl` column from the `Post` table, if it still exists in production.
- Notify client teams that announcement/post create/update endpoints now expect `attachments` instead of `imageUrl`.
