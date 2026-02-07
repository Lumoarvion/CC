# Session Notes – 2025-11-18

## Share Workflow Deep Dive
- We are consolidating every “Share” action into the existing `POST /api/posts` endpoint. Clients pass `quotedPostId` to reshare an existing post; including extra `content` or `attachments` produces a quote post, while sending only the ID (once backend allows empty content) gives a silent repost. No other endpoint—especially the legacy `/posts/{id}/repost`—should be called.
- Payload reminder for app teams:
  - `Authorization: Bearer <JWT>` header is required.
  - `content`: trimmed text up to 2,000 characters. Duplicate consecutive submissions are rejected (`409 Duplicate content detected`). We plan to relax this requirement when `quotedPostId` is present so silent shares are truly contentless.
  - `attachments`: optional array of up to 5 items. `image`, `gif`, or `video` types only; GIF/video must be the sole attachment. Always include the `metadata.r2Key` returned from `/media/presign` so the backend can delete orphaned files.
  - `quotedPostId`: positive integer referencing a non-archived post. Missing or invalid IDs return `400/404`. This is the only lever needed for reposts and quote posts.
  - `parentPostId`: reserved for future threaded replies (not comments). Keep `null` for now; continue using `/posts/{id}/comments` for lightweight discussions.
- Concrete request templates:
  - Silent share (post-MVP): `POST /api/posts` with `{ "quotedPostId": 9876 }`.
  - Quote with commentary: `POST /api/posts` + `content`, `quotedPostId`, optional `attachments`.
  - Response and error samples live in `docs/share-workflow-plan.md` for SDK and QA teams.

## Follow-Ups / Next Session TODOs
- Backend: allow `content` to be optional when `quotedPostId` is provided so the silent repost example becomes valid.
- Docs/SDKs: regenerate from `docs/openapi.json` to remove `/repost` references and expose the updated `quotedPostId`/`parentPostId` descriptions.
- Client teams: replace separate Repost/Quote buttons with a single Share entry point wired to the flow above, and validate attachment constraints locally before hitting the API.

See `docs/share-workflow-plan.md` for the full parameter tables, behavior matrix, and example payloads/responses.

## Save/Bookmark MVP
- Scope: authenticated users can save/unsave any visible, non-archived post; duplicates are ignored; deleting/archiving a post removes it from saved lists.
- Endpoints: `POST /api/posts/{id}/save` (save), `DELETE /api/posts/{id}/save` (unsave, idempotent), `GET /api/posts/saved?page&limit` returns paginated saved posts ordered by most recently saved.
- Response shape: `Post` now includes `viewerHasSaved`; save/unsave return `{ "ok": true }`; saved list returns `PostFeedResponse`.
- Errors: 401 missing/invalid token; 404 when post is missing/archived or not visible; 409 on duplicate save attempts.
- Clients: add Save/Unsave toggle on feed/detail; add Saved tab/list; optimistic toggle with rollback on error.
