Session Notes - 2025-10-02

Summary of Changes
- Super Admin role added to default seeder (roleKey=0) while keeping existing Admin/Staff/Student entries.
- Department model now includes isVisible flag; registration reference data skips hidden departments for upcoming org-admin buckets.
- Swagger generator defines OTP/reference schemas; docs/openapi.json regenerated and validator passes.
- Super-admin guarded admin creation endpoints exposed; hidden Administration department seeded for privileged accounts.
- Super-admin bootstrap now reads SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD on first boot of a fresh DB; existing accounts are left untouched.

What's Pending / Next Steps
- Build admin management UI/workflows so super-admins can manage privileged users.
- Replace startup sequelize.sync({ alter: true }) with explicit migrations for production safety.
- Consider persisting login limiter state (Redis/shared store) before scaling beyond single instance.
- Rework /api/posts/feed to incorporate announcements and personalized slices.

How to Resume
- Run npm run dev (or node src/server.js) and verify auth/register flows respect isVisible filtering.
- Use npm run docs:gen after API changes to keep docs/openapi.json current.
- Validate openapi.json with npx @apidevtools/swagger-cli validate docs/openapi.json.

Additional Notes
- Hidden Administration department now seeds automatically; rename if your org prefers a different label.
- Set SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD (for fresh deployments only) to auto-provision the first super admin.
- OTP schemas now defined: OtpRequest, OtpRequestResponse, OtpVerifyRequest, OtpVerifyResponse, ReferenceDataResponse.
