# Session Notes — 2025-11-27

Context: Feed examples in OpenAPI for repost/quote scenarios. Current examples cover:
- Standard post
- Silent repost (quotedPost only, no content/media)
- Quote with commentary + media
- Quote with media of an original that has media
- Reply that also quotes a post

Remaining example candidates to add for completeness:
- Quote with text only (no media) to show the minimal share-with-comment case
- Silent repost of an original that contains media (outer empty, inner has media)
- Reply without a quote (parentPost populated, quotedPost null)
- Announcement item in feed (`postType: announcement` with `announcementType`)
- Pinned post example (`pinnedUntil` populated to illustrate ordering)
- Media variants: GIF or video single attachment, and multi-image gallery
- Viewer flag variations (liked but not saved, or saved but not liked) to show personalization fields

Next steps: If desired, add each as a separate named example under `GET /posts/feed` `application/json.examples` so Swagger shows them in the dropdown.
