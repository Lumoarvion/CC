import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { feed } from '../src/controllers/postController.js';
import { Post, Follow, User, Like, Comment } from '../src/models/index.js';
import { logger } from '../src/utils/logger.js';

const originalFns = {
  postFindAll: Post.findAll,
  followFindAll: Follow.findAll,
  userFindByPk: User.findByPk,
  likeFindAll: Like.findAll,
  commentFindAll: Comment.findAll,
  loggerInfo: logger.info,
  loggerError: logger.error,
};

beforeEach(() => {
  logger.info = () => {};
  logger.error = () => {};
});

afterEach(() => {
  Post.findAll = originalFns.postFindAll;
  Follow.findAll = originalFns.followFindAll;
  User.findByPk = originalFns.userFindByPk;
  Like.findAll = originalFns.likeFindAll;
  Comment.findAll = originalFns.commentFindAll;
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
  const createdAt = overrides.createdAt ?? '2025-11-08T10:00:00.000Z';
  return {
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
    },
    createdAt,
    updatedAt: overrides.updatedAt ?? createdAt,
  };
}

function clonePost(post) {
  if (!post) return post;
  const plain = JSON.parse(JSON.stringify(post));
  const instance = { ...plain };
  instance.toJSON = () => ({ ...plain });
  return instance;
}

function cloneScopes(scopes = []) {
  return scopes.map((scope) => ({
    audienceScope: scope?.audienceScope ? JSON.parse(JSON.stringify(scope.audienceScope)) : undefined,
  }));
}

function takePosts(list = [], limit) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const slice = list.slice(0, typeof limit === 'number' && limit > 0 ? limit : list.length);
  return slice.map(clonePost);
}

function isAudienceScopeQuery(query) {
  return Array.isArray(query?.attributes) && query.attributes.includes('audienceScope');
}

function setupPostFindAllStub(scenario) {
  Post.findAll = async (query = {}) => {
    if (isAudienceScopeQuery(query)) {
      if (query.where && Object.prototype.hasOwnProperty.call(query.where, 'id')) {
        return cloneScopes(scenario.interactionScopes);
      }
      if (query.where && Object.prototype.hasOwnProperty.call(query.where, 'userId')) {
        return cloneScopes(scenario.authoredScopes);
      }
    }

    if (query.where?.postType === 'announcement') {
      return takePosts(scenario.announcements, query.limit);
    }

    if (query.include && query.where?.userId) {
      return takePosts(scenario.followPosts, query.limit);
    }

    const primaryInclude = Array.isArray(query.include) ? query.include[0] : undefined;
    const includeWhere = primaryInclude?.where || {};
    if (includeWhere.departmentId !== undefined) {
      return takePosts(scenario.departmentPosts, query.limit);
    }
    if (includeWhere.degreeId !== undefined) {
      return takePosts(scenario.degreePosts, query.limit);
    }

    if (query.where?.postType === 'standard') {
      return takePosts(scenario.interestPool, query.limit);
    }

    return [];
  };
}

test('feed aggregates follow + interest posts and returns announcements separately', async () => {
  const scenario = {
    interactionScopes: [{ audienceScope: { target: { scope: 'profile' }, interests: ['topic:events'] } }],
    authoredScopes: [],
    followPosts: [
      buildPostData(10, {
        createdAt: '2025-11-08T10:00:00.000Z',
        audienceScope: { target: { scope: 'profile' }, interests: ['topic:events'] },
      }),
      buildPostData(11, {
        createdAt: '2025-11-08T09:00:00.000Z',
        audienceScope: { target: { scope: 'profile' }, interests: ['department:7'] },
      }),
    ],
    interestPool: [
      buildPostData(30, {
        createdAt: '2025-11-08T08:00:00.000Z',
        audienceScope: { target: { scope: 'profile' }, interests: ['topic:events'] },
      }),
      buildPostData(31, {
        createdAt: '2025-11-08T07:00:00.000Z',
        audienceScope: { target: { scope: 'profile' }, interests: ['topic:sports'] },
      }),
    ],
    departmentPosts: [buildPostData(40)],
    degreePosts: [buildPostData(50)],
    announcements: [
      buildPostData(500, {
        postType: 'announcement',
        pinnedUntil: '2025-11-10T12:00:00.000Z',
        announcementTypeId: 3,
        announcementType: { id: 3, typeKey: 'campus_notice', displayName: 'Campus Notice', description: null },
        audienceScope: { target: { scope: 'global' }, interests: ['announcement:general'] },
      }),
    ],
  };

  setupPostFindAllStub(scenario);
  Follow.findAll = async () => [{ followingId: 2 }];
  User.findByPk = async () => ({ id: 1, departmentId: 7, degreeId: 3 });
  Like.findAll = async () => [{ postId: 999 }];
  Comment.findAll = async () => [];

  const req = { query: { limit: '3' }, user: { id: 1 } };
  const res = createRes();

  await feed(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.limit, 3);
  assert.equal(res.body.count, 3);
  assert.deepEqual(res.body.posts.map((post) => post.id), [10, 11, 30]);
  assert.equal(res.body.announcements.length, 1);
  assert.equal(res.body.announcements[0].postType, 'announcement');
});

test('feed falls back to department and degree posts and paginates by offset', async () => {
  const scenario = {
    interactionScopes: [],
    authoredScopes: [],
    followPosts: [
      buildPostData(200, { createdAt: '2025-11-08T08:00:00.000Z' }),
    ],
    interestPool: [],
    departmentPosts: [
      buildPostData(210, { createdAt: '2025-11-07T05:00:00.000Z', audienceScope: { target: { scope: 'profile' }, interests: ['department:10'] } }),
    ],
    degreePosts: [
      buildPostData(220, { createdAt: '2025-11-06T05:00:00.000Z', audienceScope: { target: { scope: 'profile' }, interests: ['degree:5'] } }),
      buildPostData(221, { createdAt: '2025-11-05T05:00:00.000Z', audienceScope: { target: { scope: 'profile' }, interests: ['degree:5'] } }),
      buildPostData(222, { createdAt: '2025-11-04T05:00:00.000Z', audienceScope: { target: { scope: 'profile' }, interests: ['degree:5'] } }),
    ],
    announcements: [
      buildPostData(700, {
        postType: 'announcement',
        pinnedUntil: '2025-12-01T00:00:00.000Z',
        announcementTypeId: 5,
        announcementType: { id: 5, typeKey: 'safety', displayName: 'Safety', description: null },
        audienceScope: { target: { scope: 'global' }, interests: ['announcement:general'] },
      }),
    ],
  };

  setupPostFindAllStub(scenario);
  Follow.findAll = async () => [];
  User.findByPk = async () => ({ id: 1, departmentId: 10, degreeId: 5 });
  Like.findAll = async () => [];
  Comment.findAll = async () => [];

  const req = { query: { page: '2', limit: '2' }, user: { id: 1 } };
  const res = createRes();

  await feed(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.page, 2);
  assert.equal(res.body.limit, 2);
  assert.equal(res.body.count, 2);
  assert.deepEqual(res.body.posts.map((post) => post.id), [220, 221]);
  assert.equal(res.body.announcements.length, 1);
});
