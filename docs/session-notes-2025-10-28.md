Session Notes - 2025-10-28

Summary of Work
- Expanded delete request/confirm logging to include requestId, OTP echo status, client IP/UA, and detailed validation outcomes (`src/controllers/userDeleteController.js`).
- Updated Swagger generator to document delete endpoints with full success/error coverage and dual non-prod/prod response examples; regenerated `docs/openapi.json`.
- Exercised the delete flow end-to-end against the running API (login → delete-request → delete-confirm) to confirm responses and new log lines in `logs/2025-10-25.log`.

Artifacts & Commands
- Regenerated docs with `npm run docs:gen`.
- Verified runtime behavior via local HTTP calls to `/api/users/me/delete-request` and `/api/users/me/delete-confirm`.

Open Questions / Follow-ups
- Consider adding automated tests for negative paths (bad OTP, expired request).
- Decide whether to redact OTP from logs in production builds once monitoring dashboards are in place.
- Feed roadmap from 2025-10-04 session still pending (unseen announcements, interest slices, trending).
