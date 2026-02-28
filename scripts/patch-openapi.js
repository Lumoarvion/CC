import fs from 'fs';

const path = 'docs/openapi.json';
const spec = JSON.parse(fs.readFileSync(path, 'utf8'));

const simpleOk = {
  description: 'OK',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Ok' } } },
};
const bearer = [{ bearerAuth: [] }];

function ensureSchemas() {
  spec.components = spec.components || {};
  spec.components.schemas = spec.components.schemas || {};
  // Normalize SimpleOk
  spec.components.schemas.SimpleOk = { type: 'object', properties: { ok: { type: 'boolean' } }, example: { ok: true } };

  // Post creation variants
  spec.components.schemas.PostCreateStandard = {
    type: 'object',
    required: ['content'],
    properties: {
      content: { type: 'string', minLength: 1, maxLength: 2000, description: 'Trimmed text, max 2000 characters.' },
      attachments: { $ref: '#/components/schemas/PostAttachments' },
    },
    additionalProperties: false,
    example: { content: 'Campus meetup tomorrow?', attachments: [] },
  };

  spec.components.schemas.RepostRequest = {
    type: 'object',
    description: 'Silent repost; no content or attachments allowed.',
    additionalProperties: false,
  };

  spec.components.schemas.QuotePostCreate = {
    type: 'object',
    properties: {
      content: { type: 'string', minLength: 1, maxLength: 2000, nullable: true },
      attachments: { $ref: '#/components/schemas/PostAttachments' },
    },
    additionalProperties: false,
    description: 'Quote post; content or attachments required. quotedPostId is taken from the path.',
    example: { content: 'My take on this', attachments: [] },
  };

  spec.components.schemas.ReplyPostCreate = {
    type: 'object',
    required: ['content'],
    properties: {
      content: { type: 'string', minLength: 1, maxLength: 2000 },
      attachments: { $ref: '#/components/schemas/PostAttachments' },
    },
    additionalProperties: false,
    description: 'Reply to a post; parentPostId comes from the path.',
    example: { content: 'Thanks for sharing!', attachments: [] },
  };

  if (!spec.components.schemas.PostAttachments) {
    spec.components.schemas.PostAttachments = {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        required: ['type', 'url'],
        properties: {
          type: { type: 'string', enum: ['image', 'gif', 'video'] },
          url: { type: 'string', format: 'uri' },
          metadata: {
            type: 'object',
            nullable: true,
            properties: {
              r2Key: { type: 'string', description: 'Required: storage key from presign endpoint.' },
              contentType: { type: 'string', nullable: true },
              size: { type: 'integer', nullable: true },
              width: { type: 'integer', nullable: true },
              height: { type: 'integer', nullable: true },
              duration: { type: 'number', nullable: true },
            },
          },
        },
      },
      description: 'Attach up to 5 images; if gif/video is present it must be the only attachment.',
    };
  }

  // Canonical UserSummary (public profile, no email)
  spec.components.schemas.UserSummary = {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 42 },
      fullName: { type: 'string', example: 'Alice Doe' },
      username: { type: 'string', example: 'alice' },
      bio: { type: 'string', example: 'CS student and maker.' },
      avatarUrl: { type: 'string', format: 'uri', example: '/uploads/avatars/a-256.webp' },
      avatarUrlFull: { type: 'string', format: 'uri', example: '/uploads/avatars/a-1024.webp' },
      bannerUrl: { type: 'string', format: 'uri', nullable: true, example: '/uploads/banners/a.webp' },
      website: { type: 'string', nullable: true, example: 'https://alice.dev' },
      location: { type: 'string', nullable: true, example: 'Chennai' },
      joinDate: { type: 'string', format: 'date', example: '2024-08-15' },
      isVerified: { type: 'boolean', example: true },
      isPrivate: { type: 'boolean', example: false },
      isLimited: { type: 'boolean', example: false },
      followersCount: { type: 'integer', example: 120 },
      followingCount: { type: 'integer', example: 180 },
      postsCount: { type: 'integer', example: 56 },
      likesCount: { type: 'integer', example: 240 },
      bookmarksCount: { type: 'integer', example: 35 },
      pinnedPostIds: { type: 'array', items: { type: 'integer' }, example: [501, 499] },
      viewerFollowing: { type: 'boolean', example: true },
      viewerFollowsBack: { type: 'boolean', example: false },
      viewerMuted: { type: 'boolean', example: false },
      viewerBlocked: { type: 'boolean', example: false },
      avatarInitial: { type: 'string', example: 'A' },
    },
    required: ['id', 'username'],
  };

  // Self profile extends UserSummary with email
  spec.components.schemas.UserSelf = {
    allOf: [
      { $ref: '#/components/schemas/UserSummary' },
      {
        type: 'object',
        properties: { email: { type: 'string', format: 'email', example: 'alice@example.edu' } },
        required: ['email'],
      },
    ],
    description: 'Fields visible to the authenticated user about themselves.',
  };
}

function ensurePath(p) {
  spec.paths[p] = spec.paths[p] || {};
}

function setOp(p, m, data) {
  ensurePath(p);
  spec.paths[p][m] = data;
}

function patchDefaultOps() {
  for (const [p, ops] of Object.entries(spec.paths)) {
    for (const [m, op] of Object.entries(ops)) {
      if (!op.summary) op.summary = `${m.toUpperCase()} ${p}`;
      if (!op.description) op.description = op.summary;
      if (!op.responses || !Object.keys(op.responses).length) {
        op.responses = { 200: simpleOk };
      }
    }
  }
}

function addProfileEndpoints() {
  const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'User ID' };
  setOp('/users/{id}', 'get', {
    tags: ['Profile'],
    summary: 'Get user profile',
    description: 'Returns public profile payload including counts and pinnedPostIds.',
    security: bearer,
    parameters: [idParam],
    responses: {
      200: { description: 'Profile', content: { 'application/json': { schema: { $ref: '#/components/schemas/UserSummary' } } } },
      404: { description: 'Not found' },
    },
  });

  setOp('/users/me', 'get', {
    tags: ['Profile'],
    summary: 'Get current user profile',
    security: bearer,
    responses: { 200: { description: 'Profile', content: { 'application/json': { schema: { $ref: '#/components/schemas/UserSelf' } } } } },
  });

  setOp('/users/me', 'patch', {
    tags: ['Profile'],
    summary: 'Update profile fields',
    security: bearer,
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              fullName: { type: 'string' },
              bio: { type: 'string' },
              website: { type: 'string' },
              location: { type: 'string' },
              bannerUrl: { type: 'string' },
              isPrivate: { type: 'boolean' },
              isLimited: { type: 'boolean' },
            },
            additionalProperties: false,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Updated profile',
        content: {
          'application/json': {
            schema: { type: 'object', properties: { ok: { type: 'boolean' }, profile: { $ref: '#/components/schemas/UserSelf' } } },
          },
        },
      },
      400: { description: 'No fields provided' },
    },
  });

  const avatarReq = {
    required: true,
    content: {
      'multipart/form-data': {
        schema: {
          type: 'object',
          properties: { avatar: { type: 'string', format: 'binary' } },
          required: ['avatar'],
        },
      },
    },
  };
  setOp('/users/me/avatar', 'post', {
    tags: ['Profile'],
    summary: 'Upload avatar',
    security: bearer,
    requestBody: avatarReq,
    responses: {
      200: { description: 'Avatar updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/AvatarUpdateResponse' } } } },
      400: { description: 'No file uploaded' },
    },
  });
  setOp('/users/me/avatar', 'delete', { tags: ['Profile'], summary: 'Delete avatar', security: bearer, responses: { 200: simpleOk } });

  const pageParams = [
    { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
    { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50 } },
  ];
  function setFeed(pathKey, schemaRef, summary) {
    setOp(pathKey, 'get', {
      tags: ['Profile'],
      summary,
      security: bearer,
      parameters: [idParam, ...pageParams],
      responses: {
        200: { description: 'Feed', content: { 'application/json': { schema: { $ref: schemaRef } } } },
        400: { description: 'Invalid user id' },
        403: { description: 'Private or blocked' },
      },
    });
  }
  setFeed('/users/{id}/posts', '#/components/schemas/UserPostsResponse', 'List user posts (with pinned)');
  setFeed('/users/{id}/replies', '#/components/schemas/UserFeedResponse', 'List replies authored by user');
  setFeed('/users/{id}/media', '#/components/schemas/UserFeedResponse', 'List user media posts');
  setFeed('/users/{id}/likes', '#/components/schemas/UserFeedResponse', 'List posts the user liked');
}

function addPostActions() {
  const postId = { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'Post ID' };
  setOp('/posts', 'post', {
    tags: ['Posts'],
    summary: 'Create standard post',
    description: 'Create a normal post. quotedPostId and parentPostId are not allowed here.',
    security: bearer,
    requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PostCreateStandard' } } } },
    responses: {
      201: { description: 'Created post', content: { 'application/json': { schema: { $ref: '#/components/schemas/Post' } } } },
      400: { description: 'Validation error' },
    },
  });

  setOp('/posts/{id}/repost', 'post', {
    tags: ['Posts'],
    summary: 'Repost (silent share)',
    description: 'Share an existing post without adding content or attachments.',
    security: bearer,
    parameters: [postId],
    requestBody: { required: false, content: { 'application/json': { schema: { $ref: '#/components/schemas/RepostRequest' } } } },
    responses: {
      201: { description: 'Created repost', content: { 'application/json': { schema: { $ref: '#/components/schemas/Post' } } } },
      400: { description: 'Validation error' },
      404: { description: 'Quoted post not found' },
    },
  });

  setOp('/posts/{id}/quote', 'post', {
    tags: ['Posts'],
    summary: 'Quote post (repost with commentary/media)',
    security: bearer,
    parameters: [postId],
    requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/QuotePostCreate' } } } },
    responses: {
      201: { description: 'Created quote post', content: { 'application/json': { schema: { $ref: '#/components/schemas/Post' } } } },
      400: { description: 'Validation error' },
      404: { description: 'Quoted post not found' },
    },
  });

  setOp('/posts/{id}/reply', 'post', {
    tags: ['Posts'],
    summary: 'Reply to a post',
    security: bearer,
    parameters: [postId],
    requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ReplyPostCreate' } } } },
    responses: {
      201: { description: 'Created reply', content: { 'application/json': { schema: { $ref: '#/components/schemas/Post' } } } },
      400: { description: 'Validation error' },
      404: { description: 'Parent post not found' },
    },
  });

  setOp('/posts/feed', 'get', {
    tags: ['Posts'],
    summary: 'Home feed',
    security: bearer,
    description: 'Returns a single paginated home feed ordered as: active announcements first (capped), followed-users unseen posts, discovery unseen posts, followed-users seen posts, then discovery seen posts. Archived posts are excluded; discovery pulls from recent unfollowed standard posts.',
    parameters: [
      { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
      { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50 } },
    ],
    responses: { 200: { description: 'Feed', content: { 'application/json': { schema: { $ref: '#/components/schemas/PostFeedResponse' } } } } },
  });

  setOp('/posts/saved', 'get', {
    tags: ['Profile'],
    summary: 'Saved/bookmarked posts of viewer',
    security: bearer,
    parameters: [
      { name: 'cursor', in: 'query', schema: { type: 'string' } },
      { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50 } },
    ],
    responses: { 200: { description: 'Saved posts', content: { 'application/json': { schema: { $ref: '#/components/schemas/UserFeedResponse' } } } } },
  });

  const simplePostAction = (path, summary) =>
    setOp(path, 'post', {
      tags: ['Posts'],
      summary,
      security: bearer,
      parameters: [postId],
      responses: { 200: simpleOk, 400: { description: 'Invalid id' }, 404: { description: 'Not found' } },
    });
  const simpleDelAction = (path, summary) =>
    setOp(path, 'delete', {
      tags: ['Posts'],
      summary,
      security: bearer,
      parameters: [postId],
      responses: { 200: simpleOk, 404: { description: 'Not found' } },
    });

  simplePostAction('/posts/{id}/like', 'Like a post');
  simpleDelAction('/posts/{id}/like', 'Unlike a post');
  simplePostAction('/posts/{id}/save', 'Save (bookmark) a post');
  simpleDelAction('/posts/{id}/save', 'Unsave a post');
  simplePostAction('/posts/{id}/pin', 'Pin a post to profile');
  simpleDelAction('/posts/{id}/pin', 'Unpin a post');

  setOp('/posts/{id}/comments', 'post', {
    tags: ['Posts'],
    summary: 'Add comment',
    security: bearer,
    parameters: [postId],
    requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CommentCreate' } } } },
    responses: { 201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Comment' } } } } },
  });

  setOp('/posts/{id}/comments', 'get', {
    tags: ['Posts'],
    summary: 'List comments',
    security: bearer,
    parameters: [
      postId,
      { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
      { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
    ],
    responses: {
      200: { description: 'Comments', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Comment' } } } } },
    },
  });
}

function addFollowAndNotifications() {
  const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'User ID' };
  setOp('/users/{id}/follow', 'post', {
    tags: ['Profile'],
    summary: 'Follow user',
    security: bearer,
    parameters: [idParam],
    responses: { 200: { description: 'Followed', content: { 'application/json': { schema: { $ref: '#/components/schemas/FollowActionResponse' } } } } },
  });
  setOp('/users/{id}/follow', 'delete', {
    tags: ['Profile'],
    summary: 'Unfollow user',
    security: bearer,
    parameters: [idParam],
    responses: { 200: { description: 'Unfollowed', content: { 'application/json': { schema: { $ref: '#/components/schemas/FollowActionResponse' } } } } },
  });

  const listResp = {
    200: { description: 'Notifications', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotificationListResponse' } } } },
  };
  setOp('/notifications', 'get', { tags: ['Users'], summary: 'List notifications', security: bearer, responses: listResp });
  setOp('/notifications/{id}/read', 'patch', {
    tags: ['Users'],
    summary: 'Mark notification read',
    security: bearer,
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
    responses: {
      200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotificationReadResponse' } } } },
      404: { description: 'Not found' },
    },
  });
  setOp('/notifications/read-all', 'patch', {
    tags: ['Users'],
    summary: 'Mark all notifications read',
    security: bearer,
    responses: { 200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotificationReadResponse' } } } } },
  });
}

function tagProfileEndpoints() {
  const profilePaths = [
    '/users/{id}',
    '/users/me',
    '/users/me/avatar',
    '/users/{id}/followers',
    '/users/{id}/following',
    '/users/{id}/posts',
    '/users/{id}/replies',
    '/users/{id}/media',
    '/users/{id}/likes',
  ];
  for (const p of profilePaths) {
    if (!spec.paths[p]) continue;
    for (const op of Object.values(spec.paths[p])) {
      op.tags = ['Profile'];
    }
  }
}

ensureSchemas();
patchDefaultOps();
addProfileEndpoints();
addPostActions();
addFollowAndNotifications();
tagProfileEndpoints();

fs.writeFileSync(path, JSON.stringify(spec, null, 2));
console.log('Patched docs/openapi.json');
