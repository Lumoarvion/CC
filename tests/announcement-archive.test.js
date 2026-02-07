import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { archiveAnnouncement, restoreAnnouncement, deleteAnnouncement } from '../src/controllers/announcementController.js';
import { Post } from '../src/models/index.js';
import { logger } from '../src/utils/logger.js';

const originalInfo = logger.info;
const originalError = logger.error;

before(() => {
  logger.info = () => {};
  logger.error = () => {};
});

after(() => {
  logger.info = originalInfo;
  logger.error = originalError;
});

function createMockRes() {
  return {
    statusCode: 200,
    jsonPayload: undefined,
    sentPayload: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonPayload = payload;
      return this;
    },
    send(payload) {
      this.sentPayload = payload;
      return this;
    },
  };
}

function buildAnnouncement(overrides = {}) {
  const state = {
    id: 42,
    postType: 'announcement',
    content: 'Important update',
    audienceScope: { target: { scope: 'global' }, interests: ['announcement:general'] },
    announcementTypeId: 7,
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
    ...overrides,
  };
  return {
    ...state,
    toJSON() {
      return { ...this };
    },
    async save() {
      this.saveCalled = true;
      return this;
    },
    async destroy() {
      this.destroyCalled = true;
      return undefined;
    },
  };
}

test('archiveAnnouncement marks announcement as archived and records metadata', async () => {
  const originalFindOne = Post.findOne;
  const mockAnnouncement = buildAnnouncement();

  Post.findOne = async (query) => {
    assert.deepEqual(query, { where: { id: 42, postType: 'announcement' } });
    return mockAnnouncement;
  };

  const req = {
    params: { id: '42' },
    user: { id: 99 },
    body: { reason: ' Outdated info ' },
  };
  const res = createMockRes();

  try {
    await archiveAnnouncement(req, res);
  } finally {
    Post.findOne = originalFindOne;
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.jsonPayload?.ok, true);
  assert.equal(mockAnnouncement.isArchived, true);
  assert.equal(mockAnnouncement.archivedBy, 'user:99');
  assert.ok(mockAnnouncement.archivedAt instanceof Date);
  assert.equal(mockAnnouncement.archiveReason, 'Outdated info');
  assert.equal(res.jsonPayload?.announcement?.isArchived, true);
  assert.equal(res.jsonPayload?.announcement?.archiveReason, 'Outdated info');
});

test('archiveAnnouncement returns 409 when announcement already archived', async () => {
  const originalFindOne = Post.findOne;
  const mockAnnouncement = buildAnnouncement({ isArchived: true });

  Post.findOne = async () => mockAnnouncement;

  const req = {
    params: { id: '42' },
    user: { id: 1 },
    body: {},
  };
  const res = createMockRes();

  try {
    await archiveAnnouncement(req, res);
  } finally {
    Post.findOne = originalFindOne;
  }

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.jsonPayload, { message: 'Announcement already archived' });
});

test('restoreAnnouncement clears archive metadata and returns announcement', async () => {
  const originalFindOne = Post.findOne;
  const mockAnnouncement = buildAnnouncement({
    isArchived: true,
    archivedAt: new Date('2025-01-01T00:00:00Z'),
    archivedBy: 'user:50',
    archiveReason: 'Expired',
  });

  Post.findOne = async () => mockAnnouncement;

  const req = {
    params: { id: '42' },
    user: { id: 12 },
  };
  const res = createMockRes();

  try {
    await restoreAnnouncement(req, res);
  } finally {
    Post.findOne = originalFindOne;
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.jsonPayload?.ok, true);
  assert.equal(mockAnnouncement.isArchived, false);
  assert.equal(mockAnnouncement.archivedAt, null);
  assert.equal(mockAnnouncement.archivedBy, null);
  assert.equal(mockAnnouncement.archiveReason, null);
  assert.equal(res.jsonPayload?.announcement?.isArchived, false);
});

test('deleteAnnouncement destroys the announcement and returns 204', async () => {
  const originalFindOne = Post.findOne;
  const mockAnnouncement = buildAnnouncement();
  let destroyCalled = false;

  mockAnnouncement.destroy = async () => {
    destroyCalled = true;
  };

  Post.findOne = async () => mockAnnouncement;

  const req = {
    params: { id: '42' },
    user: { id: 101 },
  };
  const res = createMockRes();

  try {
    await deleteAnnouncement(req, res);
  } finally {
    Post.findOne = originalFindOne;
  }

  assert.equal(res.statusCode, 204);
  assert.equal(res.sentPayload, undefined);
  assert.equal(destroyCalled, true);
});
