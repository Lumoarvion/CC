import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPost } from '../src/controllers/postController.js';
import { Post, User } from '../src/models/index.js';
import { logger } from '../src/utils/logger.js';

const originals = {
  count: Post.count,
  findOne: Post.findOne,
  findByPk: Post.findByPk,
  create: Post.create,
  userFindByPk: User.findByPk,
  loggerInfo: logger.info,
  loggerError: logger.error,
};

function resetStubs() {
  Post.count = originals.count;
  Post.findOne = originals.findOne;
  Post.findByPk = originals.findByPk;
  Post.create = originals.create;
  User.findByPk = originals.userFindByPk;
  logger.info = originals.loggerInfo;
  logger.error = originals.loggerError;
}

function mockRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };
}

function baseUser() {
  return { id: 1, roleKey: 0 };
}

beforeEach(() => {
  logger.info = () => {};
  logger.error = () => {};
});

afterEach(() => {
  resetStubs();
});

test('createPost succeeds with valid content', async () => {
  Post.count = async () => 0;
  Post.findOne = async () => null;
  Post.create = async (payload) => ({
    ...payload,
    id: 101,
    toJSON() {
      return { ...payload, id: 101 };
    },
  });
  Post.findByPk = async () => ({
    toJSON: () => ({
      id: 101,
      content: 'Hello world',
      postType: 'standard',
      audienceScope: { target: { scope: 'profile' }, interests: ['profile:general'] },
      mentions: [],
      hashtags: [],
      urls: [],
      media: [],
      User: { id: 1, fullName: 'Test User', username: 'test.user' },
    }),
  });
  User.findByPk = async () => ({
    id: 1,
    fullName: 'Test User',
    username: 'test.user',
    departmentId: 7,
    degreeId: 3,
    roleId: 2,
  });

  const req = { body: { content: 'Hello world' }, user: baseUser() };
  const res = mockRes();

  await createPost(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.payload?.postType, 'standard');
  assert.equal(res.payload?.content, 'Hello world');
  assert.deepEqual(res.payload?.user?.username, 'test.user');
});

test('createPost rejects empty content', async () => {
  const req = { body: { content: '   ' }, user: baseUser() };
  const res = mockRes();

  await createPost(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.payload, { message: 'content required' });
});

test('createPost enforces rate limiting', async () => {
  Post.count = async () => 5;
  const req = { body: { content: 'Too many' }, user: baseUser() };
  const res = mockRes();

  await createPost(req, res);

  assert.equal(res.statusCode, 429);
  assert.deepEqual(res.payload, { message: 'Too many posts, try again in a minute' });
});

test('createPost rejects duplicate content', async () => {
  Post.count = async () => 0;
  Post.findOne = async (query) => {
    if (query?.order) {
      return { content: 'Hello world' };
    }
    return null;
  };
  const req = { body: { content: 'Hello world' }, user: baseUser() };
  const res = mockRes();

  await createPost(req, res);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.payload, { message: 'Duplicate content detected' });
});

test('createPost validates quotedPostId type', async () => {
  const req = { body: { content: 'hello', quotedPostId: 'abc' }, user: baseUser() };
  const res = mockRes();

  await createPost(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.payload, { message: 'invalid quotedPostId' });
});

test('createPost returns 404 when quoted post missing', async () => {
  Post.count = async () => 0;
  let duplicateCheck = true;
  Post.findOne = async (query) => {
    if (duplicateCheck && query?.order) {
      duplicateCheck = false;
      return null;
    }
    if (query?.where?.id === 999) {
      return null;
    }
    return null;
  };

  const req = { body: { content: 'hello', quotedPostId: 999 }, user: baseUser() };
  const res = mockRes();

  await createPost(req, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.payload, { message: 'quoted post not found' });
});
