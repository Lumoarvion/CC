import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Op } from 'sequelize';
import { feed } from '../src/controllers/postController.js';
import { Post, Follow, Like, PostSave } from '../src/models/index.js';
import { logger } from '../src/utils/logger.js';

const originalFns = {
  postFindAll: Post.findAll,
  postCount: Post.count,
  followFindAll: Follow.findAll,
  likeFindAll: Like.findAll,
  postSaveFindAll: PostSave.findAll,
  loggerInfo: logger.info,
  loggerError: logger.error,
};

beforeEach(() => {
  logger.info = () => {};
  logger.error = () => {};
  Like.findAll = async () => [];
  PostSave.findAll = async () => [];
});

afterEach(() => {
  Post.findAll = originalFns.postFindAll;
  Post.count = originalFns.postCount;
  Follow.findAll = originalFns.followFindAll;
  Like.findAll = originalFns.likeFindAll;
  PostSave.findAll = originalFns.postSaveFindAll;
  logger.info = originalFns.loggerInfo;
  logger.error = originalFns.loggerError;
});

function createRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function buildPostData(id, overrides = {}) {
  const createdAt = overrides.createdAt ?? '2026-02-28T10:00:00.000Z';
  const plain = {
    id,
    content: overrides.content ?? `post-${id}`,
    postType: overrides.postType ?? 'standard',
    pinnedUntil: overrides.pinnedUntil ?? null,
    audienceScope: overrides.audienceScope ?? { target: { scope: 'profile' }, interests: ['interest:general'] },
    mentions: overrides.mentions ?? [],
    hashtags: overrides.hashtags ?? [],
    urls: overrides.urls ?? [],
    media: overrides.media ?? [],
    quotedPostId: overrides.quotedPostId ?? null,
    parentPostId: overrides.parentPostId ?? null,
    isArchived: false,
    announcementTypeId: overrides.announcementTypeId ?? null,
    announcementType: overrides.announcementType ?? null,
    userId: overrides.userId ?? id,
    User: overrides.User ?? {
      id: overrides.userId ?? id,
      fullName: overrides.fullName ?? `User ${id}`,
      username: overrides.username ?? `user${id}`,
      avatarUrl: overrides.avatarUrl ?? null,
      avatarUrlFull: overrides.avatarUrlFull ?? null,
    },
    stats: overrides.stats ?? {
      postId: id,
      likeCount: 0,
      commentCount: 0,
      quoteCount: 0,
      viewCount: 0,
    },
    createdAt,
    updatedAt: overrides.updatedAt ?? createdAt,
  };
  return plain;
}

function clonePost(post) {
  const plain = JSON.parse(JSON.stringify(post));
  return {
    ...plain,
    toJSON() {
      return { ...plain };
    },
  };
}

function hasOp(whereValue, op) {
  return Object.getOwnPropertySymbols(whereValue || {}).includes(op);
}

function setupScenario({ followingIds = [], announcements = [], followedPosts = [], discoveryPosts = [] }) {
  Follow.findAll = async () => followingIds.map((followingId) => ({ followingId }));

  Post.count = async ({ where } = {}) => {
    if (where?.postType === 'announcement') return announcements.length;
    if (where?.postType === 'standard' && hasOp(where?.userId, Op.in)) return followedPosts.length;
    if (where?.postType === 'standard' && hasOp(where?.userId, Op.notIn)) return discoveryPosts.length;
    return 0;
  };

  Post.findAll = async ({ where, limit } = {}) => {
    if (where?.postType === 'announcement') return announcements.slice(0, limit).map(clonePost);
    if (where?.postType === 'standard' && hasOp(where?.userId, Op.in)) return followedPosts.slice(0, limit).map(clonePost);
    if (where?.postType === 'standard' && hasOp(where?.userId, Op.notIn)) return discoveryPosts.slice(0, limit).map(clonePost);
    return [];
  };
}

async function runFeed({ page = '1', limit = '10', userId = 1 }) {
  const req = { query: { page, limit }, user: { id: userId } };
  const res = createRes();
  await feed(req, res);
  return res;
}

test('feed orders posts as announcements then followed unseen then discovery unseen then followed seen then discovery seen', async () => {
  setupScenario({
    followingIds: [2],
    followedPosts: [
      buildPostData(1310, { userId: 2, createdAt: '2026-02-28T09:00:00.000Z' }),
    ],
    discoveryPosts: [
      buildPostData(1510, { userId: 9, createdAt: '2026-02-28T08:00:00.000Z' }),
    ],
  });
  await runFeed({ limit: '10' });

  setupScenario({
    followingIds: [2],
    announcements: [
      buildPostData(1100, {
        postType: 'announcement',
        userId: 50,
        pinnedUntil: '2026-03-05T12:00:00.000Z',
        announcementTypeId: 3,
        announcementType: { id: 3, typeKey: 'campus_notice', displayName: 'Campus Notice', description: null },
      }),
    ],
    followedPosts: [
      buildPostData(1300, { userId: 2, createdAt: '2026-02-28T10:00:00.000Z' }),
      buildPostData(1310, { userId: 2, createdAt: '2026-02-28T09:00:00.000Z' }),
    ],
    discoveryPosts: [
      buildPostData(1500, { userId: 9, createdAt: '2026-02-28T08:00:00.000Z' }),
      buildPostData(1510, { userId: 10, createdAt: '2026-02-28T07:00:00.000Z' }),
    ],
  });

  const res = await runFeed({ limit: '10' });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.posts.map((post) => post.id), [1100, 1300, 1500, 1310, 1510]);
  assert.equal(res.body.total, 5);
  assert.equal(res.body.hasMore, false);
});

test('feed paginates across announcement and seen-unseen bucket boundaries', async () => {
  setupScenario({
    followingIds: [2],
    followedPosts: [
      buildPostData(2410, { userId: 2, createdAt: '2026-02-28T09:00:00.000Z' }),
    ],
    discoveryPosts: [
      buildPostData(2510, { userId: 9, createdAt: '2026-02-28T08:00:00.000Z' }),
    ],
  });
  await runFeed({ limit: '10' });

  setupScenario({
    followingIds: [2],
    announcements: [
      buildPostData(2100, {
        postType: 'announcement',
        userId: 50,
        pinnedUntil: '2026-03-05T12:00:00.000Z',
        announcementTypeId: 5,
        announcementType: { id: 5, typeKey: 'safety', displayName: 'Safety', description: null },
      }),
    ],
    followedPosts: [
      buildPostData(2400, { userId: 2, createdAt: '2026-02-28T10:00:00.000Z' }),
      buildPostData(2410, { userId: 2, createdAt: '2026-02-28T09:00:00.000Z' }),
    ],
    discoveryPosts: [
      buildPostData(2500, { userId: 9, createdAt: '2026-02-28T08:00:00.000Z' }),
      buildPostData(2510, { userId: 10, createdAt: '2026-02-28T07:00:00.000Z' }),
    ],
  });

  const res = await runFeed({ page: '2', limit: '2' });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.page, 2);
  assert.equal(res.body.prevPage, 1);
  assert.equal(res.body.nextPage, 3);
  assert.equal(res.body.count, 2);
  assert.equal(res.body.remaining, 1);
  assert.deepEqual(res.body.posts.map((post) => post.id), [2500, 2410]);
});

test('feed caps active announcements before counting and returning the combined list', async () => {
  setupScenario({
    announcements: [
      buildPostData(3100, { postType: 'announcement', userId: 50, pinnedUntil: '2026-03-07T12:00:00.000Z', announcementTypeId: 1, announcementType: { id: 1, typeKey: 'a', displayName: 'A', description: null } }),
      buildPostData(3101, { postType: 'announcement', userId: 50, pinnedUntil: '2026-03-06T12:00:00.000Z', announcementTypeId: 1, announcementType: { id: 1, typeKey: 'a', displayName: 'A', description: null } }),
      buildPostData(3102, { postType: 'announcement', userId: 50, pinnedUntil: '2026-03-05T12:00:00.000Z', announcementTypeId: 1, announcementType: { id: 1, typeKey: 'a', displayName: 'A', description: null } }),
      buildPostData(3103, { postType: 'announcement', userId: 50, pinnedUntil: '2026-03-04T12:00:00.000Z', announcementTypeId: 1, announcementType: { id: 1, typeKey: 'a', displayName: 'A', description: null } }),
    ],
  });

  const res = await runFeed({ limit: '10' });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.posts.map((post) => post.id), [3100, 3101, 3102]);
  assert.equal(res.body.count, 3);
  assert.equal(res.body.total, 3);
});
