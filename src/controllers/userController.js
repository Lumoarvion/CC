import { User, Follow, Post, Like, PostSave } from '../models/index.js';
import { Op } from 'sequelize';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { sequelize } from '../db.js';
import { createNotification } from '../utils/notifications.js';
import UserPin from '../models/UserPin.js';

async function buildProfilePayload(targetUser, viewerId) {
  if (!targetUser) return null;
  const base = targetUser.fullName || targetUser.username || targetUser.email || '';
  const avatarInitial = String(base).trim().charAt(0).toUpperCase();

  const postCountPromise = Post.count({ where: { userId: targetUser.id, isArchived: false } });
  const likeCountPromise = Like.count({ where: { userId: targetUser.id } });
  const bookmarkCountPromise = PostSave.count({ where: { userId: targetUser.id } });
  const pinnedPromise = UserPin.findAll({
    where: { userId: targetUser.id },
    attributes: ['postId', 'pinnedAt'],
    order: [['pinnedAt', 'DESC']],
  });
  const [postCount, likeCount, bookmarkCount, pinned] = await Promise.all([
    postCountPromise,
    likeCountPromise,
    bookmarkCountPromise,
    pinnedPromise,
  ]);

  let viewerFollowing = false;
  let viewerFollowsBack = false;
  if (viewerId && viewerId !== targetUser.id) {
    const [f1, f2] = await Promise.all([
      Follow.findOne({ where: { followerId: viewerId, followingId: targetUser.id } }),
      Follow.findOne({ where: { followerId: targetUser.id, followingId: viewerId } }),
    ]);
    viewerFollowing = Boolean(f1 && !f1.deletedAt);
    viewerFollowsBack = Boolean(f2 && !f2.deletedAt);
  }

  return {
    id: targetUser.id,
    fullName: targetUser.fullName,
    username: targetUser.username,
    bio: targetUser.bio,
    avatarUrl: targetUser.avatarUrl,
    avatarUrlFull: targetUser.avatarUrlFull,
    bannerUrl: targetUser.bannerUrl,
    website: targetUser.website,
    location: targetUser.location,
    joinDate: targetUser.joinDate || targetUser.createdAt,
    isVerified: Boolean(targetUser.isVerified),
    isPrivate: Boolean(targetUser.isPrivate),
    isLimited: Boolean(targetUser.isLimited),
    followersCount: targetUser.followersCount,
    followingCount: targetUser.followingCount,
    postsCount: postCount,
    likesCount: likeCount,
    bookmarksCount: bookmarkCount,
    pinnedPostIds: pinned.map((p) => p.postId),
    viewerFollowing,
    viewerFollowsBack,
    viewerMuted: false,
    viewerBlocked: false,
    avatarInitial,
  };
}

export const me = async (req, res) => {
  const user = await User.findByPk(req.user.id, {
    attributes: [
      'id',
      'fullName',
      'username',
      'email',
      'bio',
      'avatarUrl',
      'avatarUrlFull',
      'bannerUrl',
      'website',
      'location',
      'joinDate',
      'isVerified',
      'isPrivate',
      'isLimited',
      'followersCount',
      'followingCount',
      'createdAt',
    ],
  });
  if (!user) return res.status(404).json({ message: 'User not found' });
  const payload = await buildProfilePayload(user, req.user.id);
  return res.json(payload);
};

export const getProfile = async (req, res) => {
  const user = await User.findByPk(req.params.id, {
    attributes: [
      'id',
      'fullName',
      'username',
      'bio',
      'avatarUrl',
      'avatarUrlFull',
      'bannerUrl',
      'website',
      'location',
      'joinDate',
      'isVerified',
      'isPrivate',
      'isLimited',
      'followersCount',
      'followingCount',
      'createdAt',
    ]
  });
  if (!user) return res.status(404).json({ message: 'User not found' });
  const payload = await buildProfilePayload(user, req.user?.id ?? null);
  return res.json(payload);
};

export const updateProfile = async (req, res) => {
  const allowed = ['fullName', 'bio', 'website', 'location', 'bannerUrl', 'isPrivate', 'isLimited'];
  const updates = {};
  for (const key of allowed) {
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, key)) {
      updates[key] = req.body[key];
    }
  }
  if (!Object.keys(updates).length) {
    return res.status(400).json({ message: 'No fields to update' });
  }
  if (updates.website && typeof updates.website === 'string') {
    updates.website = updates.website.trim().slice(0, 512);
  }
  if (updates.location && typeof updates.location === 'string') {
    updates.location = updates.location.trim().slice(0, 255);
  }
  if (updates.bio && typeof updates.bio === 'string') {
    updates.bio = updates.bio.trim();
  }
  await User.update(updates, { where: { id: req.user.id } });
  const user = await User.findByPk(req.user.id);
  const payload = await buildProfilePayload(user, req.user.id);
  return res.json({ ok: true, profile: payload });
};

export const updateAvatar = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  // Source file path (multer disk storage)
  const srcPath = req.file.path || path.resolve(req.file.destination, req.file.filename);
  const uploadsRoot = path.resolve('uploads');
  const avatarsDir = path.join(uploadsRoot, 'avatars');
  const nameNoExt = path.basename(req.file.filename, path.extname(req.file.filename));

  // Output filenames (WebP)
  const out256Name = `${nameNoExt}-256.webp`;
  const out1024Name = `${nameNoExt}-1024.webp`;
  const out256Path = path.join(avatarsDir, out256Name);
  const out1024Path = path.join(avatarsDir, out1024Name);

  // Process to 256 and 1024 square WebP
  await sharp(srcPath)
    .rotate()
    .resize(256, 256, { fit: 'cover', position: 'centre' })
    .webp({ quality: 80 })
    .toFile(out256Path);

  await sharp(srcPath)
    .rotate()
    .resize(1024, 1024, { fit: 'cover', position: 'centre' })
    .webp({ quality: 80 })
    .toFile(out1024Path);

  // Remove temp/original upload
  fs.promises.unlink(srcPath).catch(() => {});

  const url = `/uploads/avatars/${out256Name}`;
  const urlFull = `/uploads/avatars/${out1024Name}`;

  // Delete old avatar files if exist
  try {
    const current = await User.findByPk(req.user.id, { attributes: ['avatarUrl', 'avatarUrlFull'] });
    const oldSmall = current?.avatarUrl || '';
    const oldFull = current?.avatarUrlFull || '';
    for (const old of [oldSmall, oldFull]) {
      if (old && old.startsWith('/uploads/avatars/')) {
        const abs = path.resolve(old.replace(/^\//, ''));
        fs.promises.unlink(abs).catch(() => {});
      }
    }
  } catch {}

  await User.update({ avatarUrl: url, avatarUrlFull: urlFull }, { where: { id: req.user.id } });
  return res.json({ ok: true, avatarUrl: url, avatarUrlFull: urlFull });
};

export const deleteAvatar = async (req, res) => {
  try {
    const current = await User.findByPk(req.user.id, { attributes: ['avatarUrl', 'avatarUrlFull'] });
    const oldSmall = current?.avatarUrl || '';
    const oldFull = current?.avatarUrlFull || '';
    for (const old of [oldSmall, oldFull]) {
      if (old && old.startsWith('/uploads/avatars/')) {
        const abs = path.resolve(old.replace(/^\//, ''));
        await fs.promises.unlink(abs).catch(() => {});
      }
    }
    await User.update({ avatarUrl: null, avatarUrlFull: null }, { where: { id: req.user.id } });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to delete avatar' });
  }
};

export const follow = async (req, res) => {
  const followingId = Number(req.params.id);
  if (!Number.isInteger(followingId) || followingId <= 0) {
    return res.status(400).json({ message: 'invalid user id' });
  }
  if (followingId === req.user.id) return res.status(400).json({ message: "You can't follow yourself" });

  const target = await User.findByPk(followingId, { attributes: ['id'] });
  if (!target) return res.status(404).json({ message: 'User not found' });

  let created = false;
  let restored = false;
  await sequelize.transaction(async (t) => {
    const existing = await Follow.findOne({ where: { followerId: req.user.id, followingId }, paranoid: false, transaction: t });
    if (existing && !existing.deletedAt) {
      return;
    }
    if (existing && existing.deletedAt) {
      await existing.restore({ transaction: t });
      restored = true;
    } else {
      await Follow.create({ followerId: req.user.id, followingId }, { transaction: t });
      created = true;
    }

    await User.increment({ followingCount: 1 }, { where: { id: req.user.id }, transaction: t });
    await User.increment({ followersCount: 1 }, { where: { id: followingId }, transaction: t });
  });

  if (created || restored) {
    await createNotification({
      userId: followingId,
      actorId: req.user.id,
      type: 'follow',
      entityType: 'user',
      entityId: req.user.id,
    });
  }

  return res.json({ ok: true, alreadyFollowing: !(created || restored) });
};

export const unfollow = async (req, res) => {
  const followingId = Number(req.params.id);
  if (!Number.isInteger(followingId) || followingId <= 0) {
    return res.status(400).json({ message: 'invalid user id' });
  }
  let removed = 0;
  await sequelize.transaction(async (t) => {
    const existing = await Follow.findOne({ where: { followerId: req.user.id, followingId }, transaction: t });
    if (!existing) return;
    await existing.destroy({ transaction: t });
    removed = 1;
    await User.update(
      { followingCount: sequelize.literal('GREATEST(following_count - 1, 0)') },
      { where: { id: req.user.id }, transaction: t }
    );
    await User.update(
      { followersCount: sequelize.literal('GREATEST(followers_count - 1, 0)') },
      { where: { id: followingId }, transaction: t }
    );
  });
  return res.json({ ok: true, removed: Boolean(removed) });
};

export const listFollowers = async (req, res) => {
  const targetUserId = Number(req.params.id);
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    return res.status(400).json({ message: 'invalid user id' });
  }
  const targetUser = await User.findByPk(targetUserId, { attributes: ['id'] });
  if (!targetUser) return res.status(404).json({ message: 'User not found' });
  const page = Math.max(parseInt(req.query.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
  const offset = (page - 1) * limit;

  const { count, rows } = await Follow.findAndCountAll({
    where: { followingId: targetUserId },
    include: [{ model: User, as: 'Follower', attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] }],
    offset,
    limit,
    order: [['createdAt', 'DESC']],
  });
  const usersRaw = rows.map((row) => row.Follower).filter(Boolean);

  const userIds = usersRaw.map((u) => u.id);
  let viewerFollows = new Set();
  let followsViewer = new Set();
  if (req.user?.id && userIds.length) {
    const [viewerFollowing, userFollowsViewer] = await Promise.all([
      Follow.findAll({ where: { followerId: req.user.id, followingId: { [Op.in]: userIds } }, attributes: ['followingId'] }),
      Follow.findAll({ where: { followerId: { [Op.in]: userIds }, followingId: req.user.id }, attributes: ['followerId'] }),
    ]);
    viewerFollows = new Set(viewerFollowing.map((f) => f.followingId));
    followsViewer = new Set(userFollowsViewer.map((f) => f.followerId));
  }

  const users = usersRaw.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    username: u.username,
    avatarUrl: u.avatarUrl,
    avatarUrlFull: u.avatarUrlFull,
    avatarInitial: (u.fullName || u.username || '').trim().charAt(0).toUpperCase() || null,
    viewerFollows: viewerFollows.has(u.id),
    followsViewer: followsViewer.has(u.id),
  }));
  const hasMore = offset + users.length < count;
  return res.json({
    page,
    limit,
    count: users.length,
    total: count,
    hasMore,
    nextPage: hasMore ? page + 1 : null,
    users,
  });
};

export const listFollowing = async (req, res) => {
  const targetUserId = Number(req.params.id);
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    return res.status(400).json({ message: 'invalid user id' });
  }
  const targetUser = await User.findByPk(targetUserId, { attributes: ['id'] });
  if (!targetUser) return res.status(404).json({ message: 'User not found' });
  const page = Math.max(parseInt(req.query.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
  const offset = (page - 1) * limit;

  const { count, rows } = await Follow.findAndCountAll({
    where: { followerId: targetUserId },
    include: [{ model: User, as: 'FollowingUser', attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] }],
    offset,
    limit,
    order: [['createdAt', 'DESC']],
  });
  const usersRaw = rows.map((row) => row.FollowingUser).filter(Boolean);

  const userIds = usersRaw.map((u) => u.id);
  let viewerFollows = new Set();
  let followsViewer = new Set();
  if (req.user?.id && userIds.length) {
    const [viewerFollowing, userFollowsViewer] = await Promise.all([
      Follow.findAll({ where: { followerId: req.user.id, followingId: { [Op.in]: userIds } }, attributes: ['followingId'] }),
      Follow.findAll({ where: { followerId: { [Op.in]: userIds }, followingId: req.user.id }, attributes: ['followerId'] }),
    ]);
    viewerFollows = new Set(viewerFollowing.map((f) => f.followingId));
    followsViewer = new Set(userFollowsViewer.map((f) => f.followerId));
  }

  const users = usersRaw.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    username: u.username,
    avatarUrl: u.avatarUrl,
    avatarUrlFull: u.avatarUrlFull,
    avatarInitial: (u.fullName || u.username || '').trim().charAt(0).toUpperCase() || null,
    viewerFollows: viewerFollows.has(u.id),
    followsViewer: followsViewer.has(u.id),
  }));
  const hasMore = offset + users.length < count;
  return res.json({
    page,
    limit,
    count: users.length,
    total: count,
    hasMore,
    nextPage: hasMore ? page + 1 : null,
    users,
  });
};
