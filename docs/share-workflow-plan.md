# Share Workflow Plan

## Goal
Provide a single, well-documented workflow for reposting content by reusing the existing `POST /api/posts` endpoint with `quotedPostId`. This keeps implementation, documentation, analytics, and moderation logic unified while we postpone threaded replies (`parentPostId`) for later work.

## Endpoint Overview
- **Route:** `POST /api/posts`
- **Auth:** `Authorization: Bearer <JWT>` (required)
- **Content Type:** `application/json`
- **Rate limit:** Hard limit of 5 creates per user per minute (`429 Too many posts, try again in a minute`).
- **Deduplication:** Consecutive identical `content` payloads are rejected (`409 Duplicate content detected`).

### Request Body Fields
| Field | Type | Required | Notes / Expected Values |
| --- | --- | --- | --- |
| `content` | string | Yes (see silent repost plan below) | Trimmed text, 1-2000 graphemes today. Duplicate consecutive posts rejected. Plan: when `quotedPostId` is provided, we will allow empty content to support true “silent” reposts. |
| `attachments` | array\<Attachment\> | No | Up to 5 media attachments. GIF/video mutually exclusive and must be the only attachment. Always include the `metadata.r2Key` issued by `/media/presign`. |
| `quotedPostId` | integer | No | ID of the post being reshared. Must resolve to a non-archived post you have permission to see. Omitting `content`+`attachments` (once supported) yields a silent repost; including either produces a quote post. |
| `parentPostId` | integer | No (reserved) | Future threaded replies. Leave `null` for now; comments still go through `/posts/{id}/comments`. |

#### Attachment Object
| Field | Type | Required | Expected Values |
| --- | --- | --- | --- |
| `type` | string | Yes | One of `image`, `gif`, `video`. GIF/video requests must send a single attachment. |
| `url` | string | Yes | HTTPS URL returned after uploading to R2. ≤2048 chars. |
| `metadata` | object | Yes | At minimum, include `r2Key` so backend can clean up storage. Optional fields: `contentType`, `size`, `width`, `height`, `duration`, any other presign metadata. |

### Behavioral Matrix
| Scenario | Required Fields | Optional Fields | Result |
| --- | --- | --- | --- |
| Standard post | `content` | `attachments` | Plain post in feed. |
| Silent repost | `quotedPostId` (≥1) | *(Plan: `content` empty, no attachments)* | Shares the original post verbatim. Implementation change needed to allow empty `content`. |
| Quote post | `content`, `quotedPostId` | `attachments` | Post shows user commentary + optional media and references source post. |
| Reply (future) | `content`, `parentPostId` | `quotedPostId`, `attachments` | Reserved for future threaded conversations. Not yet wired into UI. |

### Example Requests
#### Silent Repost (planned once `content`-optional when quoting)
```http
POST /api/posts HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "quotedPostId": 9876
}
```

#### Quote Post With Commentary + Media
```http
POST /api/posts HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "This recap nails the event highlights. Proud of the team!",
  "quotedPostId": 9876,
  "attachments": [
    {
      "type": "image",
      "url": "https://cdn.example.edu/media/posts/recap.webp",
      "metadata": {
        "r2Key": "users/12/posts/recap.webp",
        "contentType": "image/webp",
        "size": 184321,
        "width": 1280,
        "height": 720
      }
    }
  ]
}
```

### Example Response (201 Created)
```json
{
  "id": 12034,
  "content": "This recap nails the event highlights. Proud of the team!",
  "postType": "standard",
  "audienceScope": {
    "target": { "scope": "profile" },
    "interests": ["topic:events", "department:communications"]
  },
  "mentions": [],
  "hashtags": [],
  "urls": [],
  "media": [
    {
      "id": 441,
      "type": "image",
      "url": "https://cdn.example.edu/media/posts/recap.webp",
      "metadata": {
        "r2Key": "users/12/posts/recap.webp",
        "contentType": "image/webp",
        "size": 184321,
        "width": 1280,
        "height": 720,
        "order": 0
      }
    }
  ],
  "quotedPostId": 9876,
  "quotedPost": {
    "id": 9876,
    "content": "Full event recap is live—catch the keynote replay here.",
    "user": {
      "id": 52,
      "fullName": "Priya Mentor",
      "username": "priya.mentor"
    }
  },
  "parentPostId": null,
  "isArchived": false,
  "announcementTypeId": null,
  "userId": 12,
  "user": {
    "id": 12,
    "fullName": "Diego Community",
    "username": "diego.community"
  },
  "likeCount": 0,
  "commentCount": 0,
  "quoteCount": 0,
  "viewCount": 0,
  "viewerHasLiked": false,
  "createdAt": "2025-11-17T18:03:22.000Z",
  "updatedAt": "2025-11-17T18:03:22.000Z"
}
```

### Error Examples
| Status | When | Body |
| --- | --- | --- |
| 400 | Invalid/missing `quotedPostId`, `parentPostId`, attachments, or (current) `content` | `{ "message": "invalid quotedPostId" }`, `{ "message": "content required" }`, etc. |
| 404 | Referenced post not found/archived | `{ "message": "quoted post not found" }` or `{ "message": "parent post not found" }` |
| 409 | Identical consecutive `content` | `{ "message": "Duplicate content detected" }` |
| 429 | Rate limit hit | `{ "message": "Too many posts, try again in a minute" }` |
| 500 | Unexpected error | `{ "message": "Failed to create post" }` |

## Client + SDK Work
1. **Client behavior**
   - Replace legacy “Repost” button with a single “Share” action that opens the quote composer.
   - For silent shares, send only `quotedPostId` once backend allows empty `content`. Until then, send a minimal placeholder (e.g., single emoji) if needed.
   - Ensure attachments are optional but validated locally (max counts, media-type exclusivity) before hitting the API.
2. **SDK regeneration**
   - Regenerate SDKs/clients from the updated `docs/openapi.json` so they expose only the unified share method and drop any `/posts/{id}/repost` stubs.
   - Surface helper methods like `sharePost(postId, options)` that internally call `POST /posts` with `quotedPostId` so app teams can migrate quickly.
3. **Downstream communication**
   - Notify mobile/web leads that `/posts/{id}/repost` no longer exists and silent shares route through the quote flow.
   - Share this document + updated OpenAPI so QA can re-run share scenarios (standard, quote, silent once implemented).

## Follow-Ups
- [ ] Relax `content` requirement when `quotedPostId` is present so silent reposts truly send only the ID.
- [ ] Implement reply UX later by leveraging `parentPostId` (keep `/posts/{id}/comments` for lightweight comments).
- [ ] Monitor `post_stats.quoteCount` once share counts start populating, updating analytics/notifications accordingly.
