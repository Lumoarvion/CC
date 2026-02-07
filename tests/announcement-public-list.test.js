import test from 'node:test';
import assert from 'node:assert/strict';
import { listPublicAnnouncements } from '../src/controllers/announcementController.js';
import { Post } from '../src/models/index.js';

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

test('listPublicAnnouncements returns non-archived announcements', async () => {
  const original = Post.findAndCountAll;
  Post.findAndCountAll = async () => ({
    count: 1,
    rows: [
      {
        toJSON() {
          return {
            id: 104,
            content: 'Maintenance window',
            postType: 'announcement',
            isArchived: false,
            announcementType: { id: 1, typeKey: 'general', displayName: 'General', description: null },
            User: { id: 15, fullName: 'Admin User', username: 'admin' },
            media: [],
            audienceScope: { scope: 'global' },
            createdAt: '2026-01-30T00:00:00.000Z',
          };
        },
      },
    ],
  });

  const req = { user: { id: 2 }, query: { page: '1', limit: '5' } };
  const res = mockRes();

  try {
    await listPublicAnnouncements(req, res);
  } finally {
    Post.findAndCountAll = original;
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.total, 1);
  assert.equal(res.payload.announcements[0].isArchived, false);
  assert.equal(res.payload.announcements[0].announcementType?.typeKey, 'general');
});
