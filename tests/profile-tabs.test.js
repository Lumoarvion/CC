import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  userPosts,
  userReplies,
  userMedia,
  userLikes,
  pinPost,
  unpinPost,
} from '../src/controllers/postController.js';
import { User, Post, Like, PostSave, UserPin, Follow } from '../src/models/index.js';

function createRes() {
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

const originals = {};

beforeEach(() => {
  originals.UserFindByPk = User.findByPk;
  originals.UserPinFindAll = UserPin.findAll;
  originals.PostCount = Post.count;
  originals.PostFindAll = Post.findAll;
  originals.LikeFindAll = Like.findAll;
  originals.PostSaveFindAll = PostSave.findAll;
  originals.FollowFindOne = Follow.findOne;
  originals.PostFindByPk = Post.findByPk;
  originals.UserPinFindOrCreate = UserPin.findOrCreate;
  originals.UserPinFindOne = UserPin.findOne;
  originals.LikeCount = Like.count;
});

afterEach(() => {
  User.findByPk = originals.UserFindByPk;
  UserPin.findAll = originals.UserPinFindAll;
  Post.count = originals.PostCount;
  Post.findAll = originals.PostFindAll;
  Like.findAll = originals.LikeFindAll;
  PostSave.findAll = originals.PostSaveFindAll;
  Follow.findOne = originals.FollowFindOne;
  Post.findByPk = originals.PostFindByPk;
  UserPin.findOrCreate = originals.UserPinFindOrCreate;
  UserPin.findOne = originals.UserPinFindOne;
  Like.count = originals.LikeCount;
});

test('userPosts returns pinned and regular posts separated', async () => {
  User.findByPk = async () => ({ id: 10, isPrivate: false });
  Follow.findOne = async () => null;
  UserPin.findAll = async () => ([
    {
      pinnedAt: new Date('2026-01-01T00:00:00Z'),
      Post: {
        id: 1,
        audienceScope: {},
        media: [],
        mentions: [],
        hashtags: [],
        urls: [],
        User: { id: 10, fullName: 'A', username: 'a' },
        stats: { likeCount: 1, commentCount: 0, quoteCount: 0, viewCount: 0 },
      },
    },
  ]);
  Post.count = async () => 2;
  Post.findAll = async () => ([
    {
      id: 2,
      audienceScope: {},
      media: [],
      mentions: [],
      hashtags: [],
      urls: [],
      User: { id: 10, fullName: 'A', username: 'a' },
      stats: { likeCount: 0, commentCount: 0, quoteCount: 0, viewCount: 0 },
      createdAt: new Date(),
    },
  ]);
  Like.findAll = async () => [];
  PostSave.findAll = async () => [];

  const req = { params: { id: '10' }, query: { page: '1', limit: '10' }, user: { id: 99 } };
  const res = createRes();
  await userPosts(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.pinned.length, 1);
  assert.equal(res.payload.posts.length, 1);
  assert.equal(res.payload.posts[0].id, 2);
});

test('userReplies blocks access to private profile without follow', async () => {
  User.findByPk = async () => ({ id: 5, isPrivate: true });
  Follow.findOne = async () => null;
  const req = { params: { id: '5' }, query: {}, user: { id: 6 } };
  const res = createRes();
  await userReplies(req, res);
  assert.equal(res.statusCode, 403);
});

test('userPosts allows follower on private profile', async () => {
  User.findByPk = async () => ({ id: 5, isPrivate: true });
  Follow.findOne = async ({ where }) => (where.followerId === 6 ? { id: 1, deletedAt: null } : null);
  UserPin.findAll = async () => [];
  Post.count = async () => 0;
  Post.findAll = async () => [];
  Like.findAll = async () => [];
  PostSave.findAll = async () => [];
  const req = { params: { id: '5' }, query: {}, user: { id: 6 } };
  const res = createRes();
  await userPosts(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload.posts, []);
});

test('userLikes rejects invalid user id', async () => {
  const req = { params: { id: 'abc' }, query: {}, user: { id: 1 } };
  const res = createRes();
  await userLikes(req, res);
  assert.equal(res.statusCode, 400);
});

test('pinPost forbids non-owner', async () => {
  Post.findByPk = async () => ({ id: 9, userId: 2 });
  const req = { params: { id: '9' }, user: { id: 3 } };
  const res = createRes();
  await pinPost(req, res);
  assert.equal(res.statusCode, 403);
});

test('unpinPost returns 404 when pin missing', async () => {
  UserPin.findOne = async () => null;
  const req = { params: { id: '9' }, user: { id: 3 } };
  const res = createRes();
  await unpinPost(req, res);
  assert.equal(res.statusCode, 404);
});

test('userMedia enforces media-only results by using required include', async () => {
  User.findByPk = async () => ({ id: 8, isPrivate: false });
  Follow.findOne = async () => null;
  let capturedInclude = null;
  Post.count = async () => 0;
  Post.findAll = async (opts) => {
    capturedInclude = opts.include;
    return [];
  };
  const req = { params: { id: '8' }, query: {}, user: { id: 8 } };
  const res = createRes();
  await userMedia(req, res);
  assert.equal(res.statusCode, 200);
  // third include is PostMedia with required true (per controller order)
  assert.equal(capturedInclude?.[2]?.required, true);
});

test('pinPost only allows owner to pin', async () => {
  Post.findByPk = async () => ({ id: 7, userId: 7 });
  UserPin.findOrCreate = async () => [{ id: 1, userId: 7, postId: 7 }, true];
  const req = { params: { id: '7' }, user: { id: 7 } };
  const res = createRes();
  await pinPost(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
});
