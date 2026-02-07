# Session Notes — 2025-11-26

## Save/Bookmark Feature
- Added `PostSave` model with unique `(userId, postId)` and associations; `sequelize.sync({ alter: true })` will create the table.
- New endpoints: `POST /api/posts/{id}/save`, `DELETE /api/posts/{id}/save` (idempotent unsave), `GET /api/posts/saved?page&limit` (newest saved first).
- Post shape now exposes `viewerHasSaved`; feed/create/saved responses include it alongside counts.
- Errors: 401 missing/invalid token; 404 when post is missing/archived/not visible; 409 on duplicate save.
- Swagger updated with examples for save/unsave, saved list, and post responses showing saved state.

## MVP Definition
- MVP = authenticated users can save/unsave visible, non-archived posts; duplicate saves rejected; saved list paginated; responses `{ ok: true }` for toggles and `viewerHasSaved` flag on posts.
