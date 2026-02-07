Session Notes - 2025-10-06

Pending Ideas
- Implement dual-mode media uploads: local filesystem for dev, cloud storage in production, feeding PostMedia with returned URLs.

How to Resume
- Design upload endpoint/service that branches by environment.
- Ensure cleanup/lifecycle for locally stored media and cloud bucket integration.
- Keep PostMedia as canonical record regardless of storage mode.
