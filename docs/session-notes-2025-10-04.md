Session Notes - 2025-10-04

Summary of Changes
- Post model now carries postType (standard|announcement) with default standard, plus pinnedUntil and audienceScope for future targeting.
- AnnouncementView join model introduced to track which users have seen each announcement (unique announcement/user pair, timestamps).
- Model index wiring updated so Posts expose announcementViews relations via Sequelize associations.

What's Pending / Next Steps
- Add AnnouncementTypes lookup table and seed with campus-friendly categories (general, academic, event, deadline, maintenance, emergency).
- Enforce announcementType on admin-created announcements and extend admin APIs accordingly.
- Rework GET /api/posts/feed to merge unseen announcements, social graph, department/degree, and trending slices.

How to Resume
- Run the server once (or apply migrations manually) so sequelize.sync adds new columns/table.
- Design announcement creation flow in admin controllers, using new schema foundations.
- Continue feed redesign planning using announcement view data for unseen prioritization.

Feed & Timeline Plan
- Unified ordering: merge unseen announcements (admin-only) ahead of all other content, followed by social graph (followed users), department peers, degree peers, then trending recent posts to backfill.
- Visibility & audience: announcements require `announcementTypeId`, optional pin window, and validated `audienceScope`; regular posts keep existing fields but gain seen/hidden tracking metadata so audience filters apply uniformly.
- Seen tracking: continue using `AnnouncementView` and add a generalized `PostView` (or extend existing model) so unseen logic works for all post types; expose APIs to mark as seen/dismissed.
- Creation flows: admin-only announcement endpoints enforce type + pinning; general post creation stays open to users but writes to the same table, with automation to assign default scope and type `standard`.
- Feed service: refactor `/api/posts/feed` to assemble slices in priority order, dedupe posts across slices, paginate deterministically, and prefer recent items within each slice.
- Trending slice: define scoring (recent likes/comments/views) and cache results per timeframe; use as final fallback to keep feeds populated.
- Testing & telemetry: add integration tests for feed ordering, unseen filters, and admin announcement creation; emit logs/metrics so we can monitor slice composition and unseen counts.
- Post archiving added (soft flag on Post) with archive/restore/delete endpoints documented; feed now skips archived posts.
- Admin announcement APIs added (create/list/update) requiring announcement types; feed responses now include announcement metadata.
- Audience scope now auto-generated: announcements use global target with type-based interests; standard posts derive target from author profile.
- Basic interest tagging added: profile metadata and keyword heuristics populate audienceScope.interests.
- Added structured logging for post/announcement create/update/feed flows (events prefixed `post.*`, `announcement.*`).
- Post API now enforces 280-char tweets, HTTPS image URLs, duplicate spam guard, and 5/min rate limit.
- Expanded posts to 2000 chars, attachments (4 images/1 gif/video), mention/hashtag/url extraction, quote & reply support.
- To revisit: add upload pipeline that stores attachments locally in dev and cloud in production, feeding PostMedia accordingly.
