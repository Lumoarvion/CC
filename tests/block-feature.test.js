import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { blockUser, unblockUser, listBlockedUsers, follow } from '../src/controllers/userController.js';
import { likePost, comment, savePost, listComments } from '../src/controllers/postController.js';
import { User, UserBlock, Follow, Post } from '../src/models/index.js';
import { sequelize } from '../src/db.js';

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
    send(body) {
      this.payload = body;
      return this;
    },
  };
}

const originals = {};

beforeEach(() => {
  originals.userFindByPk = User.findByPk;
  originals.userUpdate = User.update;
  originals.userBlockFindOne = UserBlock.findOne;
  originals.userBlockCreate = UserBlock.create;
  originals.userBlockDestroy = UserBlock.destroy;
  originals.userBlockFindAndCountAll = UserBlock.findAndCountAll;
  originals.followFindOne = Follow.findOne;
  originals.postFindByPk = Post.findByPk;
  originals.postFindOne = Post.findOne;
  originals.sequelizeTransaction = sequelize.transaction;
});

afterEach(() => {
  User.findByPk = originals.userFindByPk;
  User.update = originals.userUpdate;
  UserBlock.findOne = originals.userBlockFindOne;
  UserBlock.create = originals.userBlockCreate;
  UserBlock.destroy = originals.userBlockDestroy;
  UserBlock.findAndCountAll = originals.userBlockFindAndCountAll;
  Follow.findOne = originals.followFindOne;
  Post.findByPk = originals.postFindByPk;
  Post.findOne = originals.postFindOne;
  sequelize.transaction = originals.sequelizeTransaction;
});

test('blockUser rejects self-block attempts', async () => {
  const req = { params: { id: '8' }, user: { id: 8 } };
  const res = mockRes();

  await blockUser(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.payload, { message: "You can't block yourself" });
});

test('blockUser creates relation and removes bidirectional follows', async () => {
  let createdPayload = null;
  let updateCalls = 0;
  let destroyedForward = false;
  let destroyedReverse = false;

  sequelize.transaction = async (fn) => fn({});
  User.findByPk = async () => ({ id: 2 });
  UserBlock.findOne = async () => null;
  UserBlock.create = async (payload) => {
    createdPayload = payload;
    return payload;
  };
  Follow.findOne = async ({ where }) => {
    if (where.followerId === 1 && where.followingId === 2) {
      return { async destroy() { destroyedForward = true; } };
    }
    if (where.followerId === 2 && where.followingId === 1) {
      return { async destroy() { destroyedReverse = true; } };
    }
    return null;
  };
  User.update = async () => { updateCalls += 1; };

  const req = { params: { id: '2' }, user: { id: 1 } };
  const res = mockRes();
  await blockUser(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.alreadyBlocked, false);
  assert.deepEqual(createdPayload, { blockerUserId: 1, blockedUserId: 2 });
  assert.equal(destroyedForward, true);
  assert.equal(destroyedReverse, true);
  assert.equal(updateCalls, 4);
});

test('blockUser is idempotent when block already exists', async () => {
  sequelize.transaction = async (fn) => fn({});
  User.findByPk = async () => ({ id: 2 });
  UserBlock.findOne = async () => ({ id: 9, deletedAt: null });
  Follow.findOne = async () => null;

  const req = { params: { id: '2' }, user: { id: 1 } };
  const res = mockRes();
  await blockUser(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.alreadyBlocked, true);
});

test('unblockUser returns removed=true when relation exists', async () => {
  UserBlock.destroy = async () => 1;
  const req = { params: { id: '2' }, user: { id: 1 } };
  const res = mockRes();

  await unblockUser(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { ok: true, removed: true });
});

test('listBlockedUsers returns paginated blocked user list', async () => {
  UserBlock.findAndCountAll = async () => ({
    count: 1,
    rows: [
      {
        blocked: { id: 10, fullName: 'Blocked User', username: 'blocked.user', avatarUrl: null, avatarUrlFull: null },
      },
    ],
  });
  const req = { user: { id: 1 }, query: { page: '1', limit: '20' } };
  const res = mockRes();

  await listBlockedUsers(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.total, 1);
  assert.equal(res.payload.users[0].username, 'blocked.user');
});

test('follow is forbidden when users are blocked', async () => {
  User.findByPk = async () => ({ id: 2 });
  UserBlock.findOne = async () => ({ id: 7 });
  const req = { params: { id: '2' }, user: { id: 1 } };
  const res = mockRes();

  await follow(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.message, 'follow not allowed due to block settings');
});

test('likePost denies interactions on blocked relations', async () => {
  Post.findByPk = async () => ({ id: 3, userId: 9 });
  UserBlock.findOne = async () => ({ id: 7 });
  const req = { params: { id: '3' }, user: { id: 1 } };
  const res = mockRes();

  await likePost(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.message, 'like not allowed due to block settings');
});

test('comment denies interactions on blocked relations', async () => {
  Post.findByPk = async () => ({ id: 3, userId: 9 });
  UserBlock.findOne = async () => ({ id: 7 });
  const req = { params: { id: '3' }, body: { content: 'hi' }, user: { id: 1 } };
  const res = mockRes();

  await comment(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.message, 'comment not allowed due to block settings');
});

test('savePost denies interactions on blocked relations', async () => {
  Post.findOne = async () => ({ id: 3, userId: 9, isArchived: false });
  UserBlock.findOne = async () => ({ id: 7 });
  const req = { params: { id: '3' }, user: { id: 1 } };
  const res = mockRes();

  await savePost(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.message, 'save not allowed due to block settings');
});

test('listComments denies access when blocked', async () => {
  Post.findByPk = async () => ({ id: 3, userId: 9 });
  UserBlock.findOne = async () => ({ id: 7 });
  const req = { params: { id: '3' }, user: { id: 1 }, query: {} };
  const res = mockRes();

  await listComments(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.message, 'comments not accessible due to block settings');
});
