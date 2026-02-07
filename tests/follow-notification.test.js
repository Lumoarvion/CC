import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { follow, unfollow, listFollowers, listFollowing } from '../src/controllers/userController.js';
import { listNotifications, markAsRead, markAllAsRead } from '../src/controllers/notificationController.js';
import { User, Follow } from '../src/models/index.js';
import Notification from '../src/models/Notification.js';
import { sequelize } from '../src/db.js';

function createMockRes() {
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
  originals.UserFindByPk = User.findByPk;
  originals.UserIncrement = User.increment;
  originals.UserUpdate = User.update;
  originals.FollowFindOne = Follow.findOne;
  originals.FollowCreate = Follow.create;
  originals.FollowFindAndCountAll = Follow.findAndCountAll;
  originals.NotificationCreate = Notification.create;
  originals.NotificationFindAndCountAll = Notification.findAndCountAll;
  originals.NotificationFindOne = Notification.findOne;
  originals.NotificationUpdate = Notification.update;
  originals.SequelizeTransaction = sequelize.transaction;
});

afterEach(() => {
  User.findByPk = originals.UserFindByPk;
  User.increment = originals.UserIncrement;
  User.update = originals.UserUpdate;
  Follow.findOne = originals.FollowFindOne;
  Follow.create = originals.FollowCreate;
  Follow.findAndCountAll = originals.FollowFindAndCountAll;
  Notification.create = originals.NotificationCreate;
  Notification.findAndCountAll = originals.NotificationFindAndCountAll;
  Notification.findOne = originals.NotificationFindOne;
  Notification.update = originals.NotificationUpdate;
  sequelize.transaction = originals.SequelizeTransaction;
});

test('follow creates relation, bumps counters, and notifies target', async () => {
  let createdFollow = null;
  let increments = [];
  let notificationPayload = null;

  sequelize.transaction = async (fn) => fn({});
  User.findByPk = async () => ({ id: 2 });
  Follow.findOne = async () => null;
  Follow.create = async (payload) => {
    createdFollow = payload;
    return payload;
  };
  User.increment = async (vals, opts) => increments.push({ vals, opts });
  Notification.create = async (payload) => {
    notificationPayload = payload;
    return payload;
  };

  const req = { params: { id: '2' }, user: { id: 1 } };
  const res = createMockRes();
  await follow(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.deepEqual(createdFollow, { followerId: 1, followingId: 2 });
  assert.equal(increments.length, 2);
  assert.equal(notificationPayload.userId, 2);
  assert.equal(notificationPayload.actorId, 1);
  assert.equal(notificationPayload.type, 'follow');
});

test('follow is idempotent when already active', async () => {
  let notificationCalled = false;
  sequelize.transaction = async (fn) => fn({});
  User.findByPk = async () => ({ id: 3 });
  Follow.findOne = async () => ({ id: 99, deletedAt: null });
  Notification.create = async () => {
    notificationCalled = true;
  };

  const req = { params: { id: '3' }, user: { id: 4 } };
  const res = createMockRes();
  await follow(req, res);

  assert.equal(res.payload.alreadyFollowing, true);
  assert.equal(notificationCalled, false);
});

test('unfollow soft deletes and decrements counters', async () => {
  let destroyed = false;
  let updates = [];

  sequelize.transaction = async (fn) => fn({});
  Follow.findOne = async () => ({
    id: 55,
    async destroy() {
      destroyed = true;
    },
  });
  User.update = async (vals) => {
    updates.push(vals);
  };

  const req = { params: { id: '7' }, user: { id: 6 } };
  const res = createMockRes();
  await unfollow(req, res);

  assert.equal(res.payload.removed, true);
  assert.equal(destroyed, true);
  assert.equal(updates.length, 2);
});

test('list followers paginates results', async () => {
  User.findByPk = async () => ({ id: 5 });
  Follow.findAndCountAll = async () => ({
    count: 2,
    rows: [
      { Follower: { id: 10, fullName: 'Alice', username: 'alice', avatarUrl: '/a' } },
      { Follower: { id: 11, fullName: 'Bob', username: 'bob', avatarUrl: '/b' } },
    ],
  });
  const req = { params: { id: '5' }, user: { id: 5 }, query: { page: '1', limit: '2' } };
  const res = createMockRes();
  await listFollowers(req, res);
  assert.equal(res.payload.total, 2);
  assert.equal(res.payload.users.length, 2);
  assert.equal(res.payload.hasMore, false);
});

test('list notifications returns unread entries', async () => {
  Notification.findAndCountAll = async () => ({
    count: 1,
    rows: [
      {
        id: 1,
        type: 'follow',
        entityType: 'user',
        entityId: 2,
        metadata: {},
        status: 'unread',
        userId: 5,
        actorId: 2,
        createdAt: '2026-01-01T00:00:00.000Z',
        readAt: null,
      },
    ],
  });
  const req = { user: { id: 5 }, query: {} };
  const res = createMockRes();
  await listNotifications(req, res);
  assert.equal(res.payload.notifications.length, 1);
  assert.equal(res.payload.notifications[0].status, 'unread');
});

test('mark notification as read', async () => {
  let saved = false;
  Notification.findOne = async () => ({
    id: 9,
    status: 'unread',
    readAt: null,
    async save() {
      saved = true;
      this.status = 'read';
      this.readAt = new Date('2026-01-02T00:00:00.000Z');
      return this;
    },
  });
  const req = { params: { id: '9' }, user: { id: 5 } };
  const res = createMockRes();
  await markAsRead(req, res);
  assert.equal(saved, true);
  assert.equal(res.payload.notification.status, 'read');
});

test('mark all notifications as read', async () => {
  Notification.update = async () => [5];
  const req = { user: { id: 5 } };
  const res = createMockRes();
  await markAllAsRead(req, res);
  assert.equal(res.payload.updated, 5);
});
