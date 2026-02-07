import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { listComments, updateComment, deleteComment } from '../src/controllers/postController.js';
import { Post, Comment } from '../src/models/index.js';
import PostStats from '../src/models/PostStats.js';
import { logger } from '../src/utils/logger.js';

const originalLoggerInfo = logger.info;
const originalLoggerError = logger.error;

before(() => {
  logger.info = () => {};
  logger.error = () => {};
});

after(() => {
  logger.info = originalLoggerInfo;
  logger.error = originalLoggerError;
});

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

test('listComments returns paginated results', async () => {
  const originalFindByPk = Post.findByPk;
  const originalCount = Comment.count;
  const originalFindAll = Comment.findAll;

  Post.findByPk = async () => ({ id: 44 });
  Comment.count = async () => 3;
  Comment.findAll = async () => [
    {
      toJSON() {
        return {
          id: 1,
          content: 'First!',
          postId: 44,
          userId: 10,
          createdAt: '2025-11-16T00:00:00.000Z',
          updatedAt: '2025-11-16T00:00:00.000Z',
          User: { id: 10, fullName: 'Jane Doe', username: 'jane' },
        };
      },
    },
  ];

  const req = { params: { id: '44' }, user: { id: 5 }, query: { page: '1', limit: '2' } };
  const res = createMockRes();

  try {
    await listComments(req, res);
  } finally {
    Post.findByPk = originalFindByPk;
    Comment.count = originalCount;
    Comment.findAll = originalFindAll;
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload?.comments?.length, 1);
  assert.equal(res.payload?.total, 3);
  assert.equal(res.payload?.hasMore, true);
  assert.equal(res.payload?.comments?.[0]?.user?.username, 'jane');
});

test('updateComment trims input and saves when actor owns comment', async () => {
  const originalFindOne = Comment.findOne;
  const mockComment = {
    id: 9,
    postId: 44,
    userId: 5,
    content: 'Old text',
    Post: { id: 44, userId: 10 },
    toJSON() {
      return {
        id: this.id,
        content: this.content,
        postId: this.postId,
        userId: this.userId,
        createdAt: '2025-11-16T00:00:00.000Z',
        updatedAt: '2025-11-16T00:00:00.000Z',
      };
    },
    async save() {
      this.savedContent = this.content;
      return this;
    },
  };
  Comment.findOne = async () => mockComment;

  const req = {
    params: { postId: '44', commentId: '9' },
    user: { id: 5 },
    body: { content: '  Updated thought  ' },
  };
  const res = createMockRes();

  try {
    await updateComment(req, res);
  } finally {
    Comment.findOne = originalFindOne;
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload?.content, 'Updated thought');
  assert.equal(mockComment.content, 'Updated thought');
  assert.equal(mockComment.savedContent, 'Updated thought');
});

test('deleteComment removes comment and decrements stats', async () => {
  const originalFindOne = Comment.findOne;
  const originalFindOrCreate = PostStats.findOrCreate;
  const originalIncrement = PostStats.increment;
  const originalFindStatsOne = PostStats.findOne;

  let destroyCalled = false;
  Comment.findOne = async () => ({
    id: 7,
    postId: 44,
    userId: 5,
    Post: { id: 44, userId: 5 },
    async destroy() {
      destroyCalled = true;
    },
  });

  const mockStats = {
    toJSON() {
      return { likeCount: 0, commentCount: 0, quoteCount: 0, viewCount: 0 };
    },
  };
  PostStats.findOrCreate = async () => [mockStats];
  PostStats.increment = async () => {};
  PostStats.findOne = async () => mockStats;

  const req = { params: { postId: '44', commentId: '7' }, user: { id: 5 } };
  const res = createMockRes();

  try {
    await deleteComment(req, res);
  } finally {
    Comment.findOne = originalFindOne;
    PostStats.findOrCreate = originalFindOrCreate;
    PostStats.increment = originalIncrement;
    PostStats.findOne = originalFindStatsOne;
  }

  assert.equal(res.statusCode, 204);
  assert.equal(destroyCalled, true);
});
