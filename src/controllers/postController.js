import { Op } from 'sequelize';
import { Post, User, Comment, Like, Follow, AnnouncementType, PostMedia, PostStats, PostSave, UserPin } from '../models/index.js';
import { buildStandardPostScope, normalizeAudienceScope } from '../utils/audienceScope.js';
import { logger } from '../utils/logger.js';
import { normalizePostMediaInput, attachMediaToPost, serializeMedia, deleteMediaForPost } from '../utils/postMedia.js';
import { adjustPostStats, getPostStats, projectStats } from '../utils/postStats.js';
import { trackViews } from '../utils/viewTracker.js';
import { createNotification } from '../utils/notifications.js';

const ADMIN_ROLE_KEYS = new Set([0, 1]);
const MAX_POST_LENGTH = 2000;
const MAX_POSTS_PER_MINUTE = 5;

function isAdmin(user) {
  if (!user) return false;
  const value = Number(user.roleKey);
  return Number.isFinite(value) && ADMIN_ROLE_KEYS.has(value);
}

function canManagePost(user, post) {
  if (!user || !post) return false;
  if (post.userId === user.id) return true;
  return isAdmin(user);
}

function normalizeReason(reason) {
  if (typeof reason !== 'string') return null;
  const trimmed = reason.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 255);
}

function sanitizeContentInput(raw) {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) return '';
  const withoutControl = trimmed
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
  const collapsed = withoutControl
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .trim();
  return collapsed;
}

function countGraphemes(value) {
  if (!value) return 0;
  return [...value].length;
}

function computeAvatarInitial(user) {
  const base = (user?.fullName || user?.username || '').trim();
  if (!base) return null;
  return base.charAt(0).toUpperCase();
}

function extractEntities(content) {
  const mentions = new Set();
  const hashtags = new Set();
  const urls = new Set();

  if (!content) {
    return { mentions: [], hashtags: [], urls: [] };
  }

  const mentionRegex = /@([A-Za-z0-9._-]{1,30})/g;
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.add(match[1].toLowerCase());
  }

  const hashtagRegex = /#([A-Za-z0-9_]{1,100})/g;
  while ((match = hashtagRegex.exec(content)) !== null) {
    hashtags.add(match[1].toLowerCase());
  }

  const urlRegex = /https?:\/\/[^\s]+/gi;
  while ((match = urlRegex.exec(content)) !== null) {
    try {
      const normalized = new URL(match[0]).toString();
      urls.add(normalized);
    } catch {
      // ignore malformed
    }
  }

  return {
    mentions: Array.from(mentions),
    hashtags: Array.from(hashtags),
    urls: Array.from(urls),
  };
}

function serializeNestedPost(postInstance) {
  if (!postInstance) return null;
  const plain = typeof postInstance.toJSON === 'function' ? postInstance.toJSON() : { ...postInstance };
  const result = {
    id: plain.id,
    content: plain.content,
    postType: plain.postType,
    audienceScope: normalizeAudienceScope(plain.audienceScope),
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    userId: plain.userId,
  };
  if (plain.User) {
    result.user = {
      id: plain.User.id,
      fullName: plain.User.fullName,
      username: plain.User.username,
      avatarUrl: plain.User.avatarUrl,
      avatarUrlFull: plain.User.avatarUrlFull,
      avatarInitial: computeAvatarInitial(plain.User),
    };
  }
  return result;
}

function toPlainPost(postInstance) {
  const plain = typeof postInstance.toJSON === 'function' ? postInstance.toJSON() : { ...postInstance };
  plain.audienceScope = normalizeAudienceScope(plain.audienceScope);
  plain.media = serializeMedia(plain.media || plain.Media || []);
  delete plain.Media;

  plain.mentions = Array.isArray(plain.mentions) ? plain.mentions : [];
  plain.hashtags = Array.isArray(plain.hashtags) ? plain.hashtags : [];
  plain.urls = Array.isArray(plain.urls) ? plain.urls : [];

  const type = plain.announcementType || plain.AnnouncementType || null;
  plain.announcementType = type
    ? {
        id: type.id,
        typeKey: type.typeKey,
        displayName: type.displayName,
        description: type.description ?? null,
      }
    : null;
  delete plain.AnnouncementType;

  if (plain.User) {
    plain.user = {
      id: plain.User.id,
      fullName: plain.User.fullName,
      username: plain.User.username,
      avatarUrl: plain.User.avatarUrl,
      avatarUrlFull: plain.User.avatarUrlFull,
      avatarInitial: computeAvatarInitial(plain.User),
    };
    delete plain.User;
  }

  if (plain.quotedPost) {
    plain.quotedPost = serializeNestedPost(plain.quotedPost);
  }
  if (plain.parentPost) {
    plain.parentPost = serializeNestedPost(plain.parentPost);
  }

  const stats = projectStats(plain.stats);
  plain.likeCount = stats.likeCount;
  plain.commentCount = stats.commentCount;
  plain.quoteCount = stats.quoteCount;
  plain.viewCount = stats.viewCount;
  delete plain.stats;
  plain.viewerHasLiked = Boolean(plain.viewerHasLiked);
  plain.viewerHasSaved = Boolean(plain.viewerHasSaved);
  return plain;
}

function toPlainComment(commentInstance) {
  if (!commentInstance) return null;
  const plain = typeof commentInstance.toJSON === 'function' ? commentInstance.toJSON() : { ...commentInstance };
  if (plain.User) {
    plain.user = {
      id: plain.User.id,
      fullName: plain.User.fullName,
      username: plain.User.username,
      avatarUrl: plain.User.avatarUrl,
      avatarUrlFull: plain.User.avatarUrlFull,
      avatarInitial: computeAvatarInitial(plain.User),
    };
    delete plain.User;
  }
  if (plain.Post) {
    delete plain.Post;
  }
  return plain;
}

async function loadReferencedPost(postId, relationLabel = 'generic') {
  if (!postId) return null;
  logger.info('post.reference.lookup', { relation: relationLabel, postId });
  const post = await Post.findOne({ where: { id: postId, isArchived: false } });
  if (!post) {
    logger.info('post.reference.missing', { relation: relationLabel, postId });
  } else {
    logger.info('post.reference.found', { relation: relationLabel, postId, ownerId: post.userId });
  }
  return post;
}

// Mode-aware wrappers let us expose separate endpoints while reusing core logic
export const createStandardPost = (req, res) => {
  req._postMode = 'standard';
  return createPost(req, res);
};

export const repostPost = (req, res) => {
  req._postMode = 'repost';
  req.body = req.body || {};
  req.body.quotedPostId = Number(req.params.id);
  return createPost(req, res);
};

export const quotePost = (req, res) => {
  req._postMode = 'quote';
  req.body = req.body || {};
  req.body.quotedPostId = Number(req.params.id);
  req.body.parentPostId = null;
  return createPost(req, res);
};

export const replyPost = (req, res) => {
  req._postMode = 'reply';
  req.body = req.body || {};
  req.body.parentPostId = Number(req.params.id);
  req.body.quotedPostId = null;
  return createPost(req, res);
};

export const createPost = async (req, res) => {
  const mode = req._postMode || 'standard';
  try {
    const { content, attachments: rawAttachments, quotedPostId, parentPostId } = req.body || {};
    const attachmentsCount = Array.isArray(rawAttachments) ? rawAttachments.length : rawAttachments ? 1 : 0;
    logger.info('post.create.request_received', {
      userId: req.user.id,
      rawLength: typeof content === 'string' ? content.length : 0,
      attachmentsCount,
      quotedPostId: quotedPostId ?? null,
      parentPostId: parentPostId ?? null,
    });

    const sanitizedContent = sanitizeContentInput(content);
    // Mode-specific validation
    const hasQuoted = quotedPostId !== undefined && quotedPostId !== null;
    const hasParent = parentPostId !== undefined && parentPostId !== null;
    const quotedIdNum = Number(quotedPostId);
    const parentIdNum = Number(parentPostId);

    if (mode === 'standard') {
      if (hasQuoted || hasParent) {
        logger.info('post.create.validation_failed', { userId: req.user.id, reason: 'disallowed_quoted_or_parent' });
        return res.status(400).json({ message: 'quotedPostId and parentPostId are not allowed for standard posts' });
      }
      if (!sanitizedContent) {
        logger.info('post.create.validation_failed', { userId: req.user.id, reason: 'missing_content' });
        return res.status(400).json({ message: 'content required' });
      }
    }

    if (mode === 'repost') {
      if (!Number.isInteger(quotedIdNum) || quotedIdNum <= 0) {
        logger.info('post.create.validation_failed', { userId: req.user.id, reason: 'invalid_quoted_post_id' });
        return res.status(400).json({ message: 'invalid quotedPostId' });
      }
      if (sanitizedContent) {
        logger.info('post.create.validation_failed', { userId: req.user.id, reason: 'content_not_allowed_in_repost' });
        return res.status(400).json({ message: 'content is not allowed for repost' });
      }
      if (attachmentsCount) {
        logger.info('post.create.validation_failed', { userId: req.user.id, reason: 'attachments_not_allowed_in_repost' });
        return res.status(400).json({ message: 'attachments are not allowed for repost' });
      }
    }

    if (mode === 'quote') {
      if (!Number.isInteger(quotedIdNum) || quotedIdNum <= 0) {
        logger.info('post.create.validation_failed', { userId: req.user.id, reason: 'invalid_quoted_post_id' });
        return res.status(400).json({ message: 'invalid quotedPostId' });
      }
      if (hasParent) {
        logger.info('post.create.validation_failed', { userId: req.user.id, reason: 'parent_not_allowed_in_quote' });
        return res.status(400).json({ message: 'parentPostId is not allowed for quote posts' });
      }
      if (!sanitizedContent && !attachmentsCount) {
        logger.info('post.create.validation_failed', { userId: req.user.id, reason: 'missing_content_or_media_for_quote' });
        return res.status(400).json({ message: 'content or attachments required for quote post' });
      }
    }

    if (mode === 'reply') {
      if (!Number.isInteger(parentIdNum) || parentIdNum <= 0) {
        logger.info('post.create.validation_failed', { userId: req.user.id, reason: 'invalid_parent_post_id' });
        return res.status(400).json({ message: 'invalid parentPostId' });
      }
      if (hasQuoted) {
        logger.info('post.create.validation_failed', { userId: req.user.id, reason: 'quoted_not_allowed_in_reply' });
        return res.status(400).json({ message: 'quotedPostId is not allowed for replies' });
      }
      if (!sanitizedContent) {
        logger.info('post.create.validation_failed', { userId: req.user.id, reason: 'missing_content' });
        return res.status(400).json({ message: 'content required' });
      }
    }

    if (!sanitizedContent && mode !== 'repost') {
      logger.info('post.create.validation_failed', { userId: req.user.id, reason: 'missing_content' });
      return res.status(400).json({ message: 'content required' });
    }

    const length = countGraphemes(sanitizedContent);
    if (mode !== 'repost' && length > MAX_POST_LENGTH) {
      logger.info('post.create.validation_failed', { userId: req.user.id, reason: 'length_exceeded', length });
      return res.status(400).json({ message: `content exceeds ${MAX_POST_LENGTH} characters` });
    }
    logger.info('post.create.content_validated', {
      userId: req.user.id,
      length,
      lineCount: sanitizedContent ? sanitizedContent.split('\n').length : 0,
    });

    let normalizedAttachments = [];
    try {
      normalizedAttachments = normalizePostMediaInput(rawAttachments);
    } catch (err) {
      logger.info('post.create.validation_failed', {
        userId: req.user.id,
        reason: err instanceof Error ? err.message : String(err),
        stage: 'attachments',
      });
      return res.status(400).json({ message: err.message });
    }
    logger.info('post.create.attachments_normalized', {
      userId: req.user.id,
      attachmentsCount: normalizedAttachments.length,
      attachmentTypes: normalizedAttachments.map((item) => item.type),
    });

    const rateWindowStart = new Date(Date.now() - 60_000);
    const recentCount = await Post.count({
      where: {
        userId: req.user.id,
        createdAt: { [Op.gt]: rateWindowStart },
      },
    });
    logger.info('post.create.rate_window_checked', {
      userId: req.user.id,
      windowStart: rateWindowStart.toISOString(),
      recentCount,
    });
    if (recentCount >= MAX_POSTS_PER_MINUTE) {
      logger.info('post.create.rate_limited', { userId: req.user.id, recentCount });
      return res.status(429).json({ message: 'Too many posts, try again in a minute' });
    }

    const lastPost = await Post.findOne({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
    });
    let isDuplicate = false;
    if (lastPost) {
      const lastNormalized = sanitizeContentInput(lastPost.content);
      if (lastNormalized && lastNormalized === sanitizedContent) {
        isDuplicate = true;
      }
    }
    logger.info('post.create.duplicate_check', {
      userId: req.user.id,
      lastPostId: lastPost?.id ?? null,
      lastPostCreatedAt: lastPost?.createdAt ?? null,
      isDuplicate,
    });
    if (isDuplicate) {
      logger.info('post.create.duplicate', { userId: req.user.id, lastPostId: lastPost?.id ?? null });
      return res.status(409).json({ message: 'Duplicate content detected' });
    }

    let quotedPost = null;
    let parentPost = null;

    if (quotedPostId !== undefined && quotedPostId !== null) {
      const parsedId = Number(quotedPostId);
      if (!Number.isInteger(parsedId) || parsedId <= 0) {
        logger.info('post.create.validation_failed', { userId: req.user.id, reason: 'invalid_quoted_post_id' });
        return res.status(400).json({ message: 'invalid quotedPostId' });
      }
      quotedPost = await loadReferencedPost(parsedId, 'quotedPost');
      if (!quotedPost) {
        return res.status(404).json({ message: 'quoted post not found' });
      }
    }

    if (parentPostId !== undefined && parentPostId !== null) {
      const parsedId = Number(parentPostId);
      if (!Number.isInteger(parsedId) || parsedId <= 0) {
        logger.info('post.create.validation_failed', { userId: req.user.id, reason: 'invalid_parent_post_id' });
        return res.status(400).json({ message: 'invalid parentPostId' });
      }
      parentPost = await loadReferencedPost(parsedId, 'parentPost');
      if (!parentPost) {
        return res.status(404).json({ message: 'parent post not found' });
      }
    }

    const entities = extractEntities(sanitizedContent);
    const entityCounts = {
      mentions: entities.mentions.length,
      hashtags: entities.hashtags.length,
      urls: entities.urls.length,
    };
    logger.info('post.create.entities_extracted', { userId: req.user.id, ...entityCounts });

    if (quotedPostId !== undefined && quotedPostId !== null) {
      const resolvedQuotedPostId = quotedPost?.id ?? (Number.isInteger(Number(quotedPostId)) ? Number(quotedPostId) : null);
      logger.info('post.repost.parameters', {
        actorId: req.user.id,
        quotedPostId: resolvedQuotedPostId,
        quotedOwnerId: quotedPost?.userId ?? null,
        parentPostId: parentPost?.id ?? null,
        content: sanitizedContent,
        attachments: normalizedAttachments,
        mentions: entities.mentions,
        hashtags: entities.hashtags,
        urls: entities.urls,
      });
    }

    const actor = await User.findByPk(req.user.id, {
      attributes: ['id', 'fullName', 'username', 'departmentId', 'degreeId', 'roleId'],
    });
    if (!actor) {
      logger.warn('post.create.actor_missing', { userId: req.user.id });
    } else {
      logger.info('post.create.actor_resolved', {
        userId: req.user.id,
        departmentId: actor.departmentId,
        degreeId: actor.degreeId,
        roleId: actor.roleId,
      });
    }
    const scope = buildStandardPostScope({ user: actor, roleKey: req.user.roleKey, content: sanitizedContent });
    logger.info('post.create.scope_resolved', {
      userId: req.user.id,
      targetScope: scope?.target?.scope ?? 'unknown',
      interestCount: Array.isArray(scope?.interests) ? scope.interests.length : 0,
    });

    const creationStartedAt = Date.now();
    const post = await Post.create({
      content: sanitizedContent,
      userId: req.user.id,
      postType: 'standard',
      announcementTypeId: null,
      audienceScope: scope,
      mentions: entities.mentions,
      hashtags: entities.hashtags,
      urls: entities.urls,
      quotedPostId: quotedPost ? quotedPost.id : null,
      parentPostId: parentPost ? parentPost.id : null,
    });
    logger.info('post.create.persisted', {
      actorId: req.user.id,
      postId: post.id,
      durationMs: Date.now() - creationStartedAt,
    });

    const stats = await getPostStats(post.id);
    logger.info('post.create.stats_initialized', { postId: post.id });

    await attachMediaToPost(post.id, normalizedAttachments);
    logger.info('post.create.media_attached', {
      postId: post.id,
      attachmentsCount: normalizedAttachments.length,
    });

    const withRelations = await Post.findByPk(post.id, {
      include: [
        { model: User, attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] },
        { model: AnnouncementType, as: 'announcementType', attributes: ['id', 'typeKey', 'displayName', 'description'] },
        { model: PostMedia, as: 'media' },
        { model: Post, as: 'quotedPost', include: [{ model: User, attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] }] },
        { model: Post, as: 'parentPost', include: [{ model: User, attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] }] },
        { model: PostStats, as: 'stats' },
      ],
    });
    logger.info('post.create.relations_loaded', { postId: post.id, hydrated: Boolean(withRelations) });

    logger.info('post.create.success', {
      actorId: req.user.id,
      postId: post.id,
      interests: scope.interests,
      mediaCount: normalizedAttachments.length,
      entityCounts,
      quotedPostId: quotedPost?.id ?? null,
      parentPostId: parentPost?.id ?? null,
    });
    const responsePost = withRelations ?? post;
    if (!withRelations && typeof responsePost.setDataValue === 'function') {
      responsePost.setDataValue('stats', stats);
    }
    return res.status(201).json(toPlainPost(responsePost));
  } catch (err) {
    logger.error('post.create.error', { userId: req.user.id, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to create post' });
  }
};

export const feed = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '10', 10), 1), 50);
    const offset = (page - 1) * limit;
    logger.info('post.feed.request_received', { userId: req.user.id, page, limit, offset });

    const following = await Follow.findAll({ where: { followerId: req.user.id }, attributes: ['followingId'] });
    const followingIds = following.map((f) => f.followingId);
    const feedActorIds = Array.from(new Set([req.user.id, ...followingIds]));
    logger.info('post.feed.following_resolved', {
      userId: req.user.id,
      followingCount: followingIds.length,
      uniqueActorCount: feedActorIds.length,
    });

    const where = {
      userId: { [Op.in]: feedActorIds },
      isArchived: false,
    };
    const queryStartedAt = Date.now();
    const [total, posts] = await Promise.all([
      Post.count({ where }),
      Post.findAll({
        where,
        include: [
          { model: User, attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] },
          { model: AnnouncementType, as: 'announcementType', attributes: ['id', 'typeKey', 'displayName', 'description'] },
          { model: PostMedia, as: 'media' },
          { model: Post, as: 'quotedPost', include: [{ model: User, attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] }] },
          { model: Post, as: 'parentPost', include: [{ model: User, attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] }] },
          {
            model: PostStats,
            as: 'stats',
            attributes: ['postId', 'likeCount', 'commentCount', 'quoteCount', 'viewCount'],
          },
        ],
        order: [
          ['pinnedUntil', 'DESC'],
          ['createdAt', 'DESC'],
        ],
        limit,
        offset,
      }),
    ]);
    const queryDurationMs = Date.now() - queryStartedAt;

    const { posts: serialized, likedCount, savedCount, followingCount } = await serializePostsForViewer(posts, req.user.id);
    logger.info('post.feed.viewer_flags_loaded', {
      userId: req.user.id,
      postCount: serialized.length,
      viewerLikes: likedCount,
      viewerSaves: savedCount,
      viewerFollows: followingCount,
    });
    const returnedCount = serialized.length;
    const hasMore = offset + returnedCount < total;
    const nextPage = hasMore ? page + 1 : null;
    const prevPage = page > 1 ? page - 1 : null;
    const remaining = Math.max(total - (offset + returnedCount), 0);
    let nextCursor = null;
    if (hasMore && serialized[returnedCount - 1]) {
      try {
        const cursorPayload = {
          createdAt: serialized[returnedCount - 1].createdAt,
          id: serialized[returnedCount - 1].id,
        };
        nextCursor = Buffer.from(JSON.stringify(cursorPayload)).toString('base64');
      } catch {
        nextCursor = null;
      }
    }
    logger.info('post.feed.pagination_computed', {
      userId: req.user.id,
      page,
      limit,
      offset,
      returnedCount,
      total,
      hasMore,
      nextPage,
      prevPage,
      remaining,
      nextCursor,
    });
    logger.info('post.feed.success', {
      userId: req.user.id,
      page,
      count: returnedCount,
      limit,
      durationMs: queryDurationMs,
      statsIncluded: true,
      viewerLikes: likedCount,
      viewerSaves: savedCount,
      viewerFollows: followingCount,
      hasMore,
      total,
      nextPage,
      prevPage,
      remaining,
    });
    return res.json({
      page,
      prevPage,
      nextPage,
      limit,
      count: returnedCount,
      total,
      hasMore,
      nextCursor,
      remaining,
      posts: serialized,
    });
  } catch (err) {
    logger.error('post.feed.error', { userId: req.user.id, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to load feed' });
  }
};

function buildPaginationResponse(page, limit, returnedCount, total, items) {
  const offset = (page - 1) * limit;
  const hasMore = offset + returnedCount < total;
  const nextPage = hasMore ? page + 1 : null;
  const prevPage = page > 1 ? page - 1 : null;
  return { page, prevPage, nextPage, limit, total, count: returnedCount, hasMore, posts: items };
}

async function hydrateViewerFlags(viewerId, posts, { includeSaves = true } = {}) {
  const postIds = posts.map((p) => p.id);
  const authorIds = posts.map((p) => p.userId);
  if (!viewerId || (!postIds.length && !authorIds.length)) {
    return { likedPostIds: new Set(), savedPostIds: new Set(), followingAuthorIds: new Set() };
  }

  const likePromise = postIds.length
    ? Like.findAll({ where: { userId: viewerId, postId: { [Op.in]: postIds } }, attributes: ['postId'] })
    : Promise.resolve([]);
  const savePromise =
    includeSaves && postIds.length
      ? PostSave.findAll({ where: { userId: viewerId, postId: { [Op.in]: postIds } }, attributes: ['postId'] })
      : Promise.resolve([]);
  const followPromise = authorIds.length
    ? Follow.findAll({ where: { followerId: viewerId, followingId: { [Op.in]: authorIds } }, attributes: ['followingId'] })
    : Promise.resolve([]);

  const [likes, saves, follows] = await Promise.all([likePromise, savePromise, followPromise]);
  return {
    likedPostIds: new Set(likes.map((l) => l.postId)),
    savedPostIds: new Set(saves.map((s) => s.postId)),
    followingAuthorIds: new Set(follows.map((f) => f.followingId)),
  };
}

async function serializePostsForViewer(posts, viewerId, { forceSaved = false } = {}) {
  const { likedPostIds, savedPostIds, followingAuthorIds } = await hydrateViewerFlags(viewerId, posts, {
    includeSaves: !forceSaved,
  });
  const viewIncrements = await trackViews({ viewerId, postIds: posts.map((p) => p.id) });
  const incrementSet = new Set(viewIncrements || []);
  return {
    likedCount: likedPostIds.size,
    savedCount: savedPostIds.size,
    followingCount: followingAuthorIds.size,
    posts: posts.map((post) => {
      const plain = toPlainPost(post);
      plain.viewerHasLiked = likedPostIds.has(post.id);
      plain.viewerHasSaved = forceSaved ? true : savedPostIds.has(post.id);
      plain.viewerFollowsAuthor = followingAuthorIds.has(post.userId);
      if (incrementSet.has(post.id)) {
        plain.viewCount = (plain.viewCount || 0) + 1;
        adjustPostStats(post.id, { viewDelta: 1 }).catch(() => {});
      }
      return plain;
    }),
  };
}

async function fetchUserPostsBase({ userId, viewerId, page = 1, limit = 10, whereExtra = {}, includeMediaRequired = false }) {
  const offset = (page - 1) * limit;
  const where = { userId, isArchived: false, ...whereExtra };
  const include = [
    { model: User, attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] },
    { model: AnnouncementType, as: 'announcementType', attributes: ['id', 'typeKey', 'displayName', 'description'] },
    { model: PostMedia, as: 'media', required: includeMediaRequired },
    { model: Post, as: 'quotedPost', include: [{ model: User, attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] }] },
    { model: Post, as: 'parentPost', include: [{ model: User, attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] }] },
    { model: PostStats, as: 'stats', attributes: ['postId', 'likeCount', 'commentCount', 'quoteCount', 'viewCount'] },
  ];
  const [total, posts] = await Promise.all([
    Post.count({ where }),
    Post.findAll({
      where,
      include,
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit,
      offset,
    }),
  ]);
  const { posts: serialized } = await serializePostsForViewer(posts, viewerId);
  return { total, posts: serialized, page, limit };
}

async function loadTargetUser(targetUserId) {
  return User.findByPk(targetUserId, {
    attributes: [
      'id',
      'fullName',
      'username',
      'isPrivate',
      'isLimited',
      'isVerified',
      'bannerUrl',
      'avatarUrl',
      'createdAt',
    ],
  });
}

async function ensureProfileAccess(targetUser, viewerId) {
  if (!targetUser) return { status: 404, body: { message: 'User not found' } };
  if (targetUser.isPrivate && targetUser.id !== viewerId) {
    const follows = await Follow.findOne({ where: { followerId: viewerId, followingId: targetUser.id } });
    if (!follows || follows.deletedAt) {
      return { status: 403, body: { message: 'Profile is private' } };
    }
  }
  return null;
}

export const userPosts = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: 'invalid user id' });
    }
    const targetUser = await loadTargetUser(userId);
    const accessError = await ensureProfileAccess(targetUser, req.user.id);
    if (accessError) return res.status(accessError.status).json(accessError.body);
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '10', 10), 1), 50);

    const pins = await UserPin.findAll({
      where: { userId },
      include: [
        {
          model: Post,
          where: { isArchived: false },
          include: [
            { model: User, attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] },
            { model: AnnouncementType, as: 'announcementType', attributes: ['id', 'typeKey', 'displayName', 'description'] },
            { model: PostMedia, as: 'media' },
            { model: Post, as: 'quotedPost', include: [{ model: User, attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] }] },
            { model: Post, as: 'parentPost', include: [{ model: User, attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] }] },
            { model: PostStats, as: 'stats', attributes: ['postId', 'likeCount', 'commentCount', 'quoteCount', 'viewCount'] },
          ],
        },
      ],
      order: [['pinnedAt', 'DESC']],
    });

    const pinnedPosts = pins.map((pin) => {
      const plain = toPlainPost(pin.Post);
      plain.isPinned = true;
      plain.pinnedAt = pin.pinnedAt;
      return plain;
    });
    const pinnedIds = new Set(pinnedPosts.map((p) => p.id));
    const { total, posts } = await fetchUserPostsBase({
      userId,
      viewerId: req.user.id,
      page,
      limit,
      whereExtra: { id: { [Op.notIn]: Array.from(pinnedIds) } },
    });
    const response = buildPaginationResponse(page, limit, posts.length, total, posts);
    return res.json({ ...response, pinned: pinnedPosts });
  } catch (err) {
    logger.error('post.user_posts.error', { userId: req.user.id, targetId: req.params.id, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to load user posts' });
  }
};

export const userReplies = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ message: 'invalid user id' });
    const targetUser = await loadTargetUser(userId);
    const accessError = await ensureProfileAccess(targetUser, req.user.id);
    if (accessError) return res.status(accessError.status).json(accessError.body);
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '10', 10), 1), 50);
    const { total, posts } = await fetchUserPostsBase({
      userId,
      viewerId: req.user.id,
      page,
      limit,
      whereExtra: {
        [Op.or]: [
          { parentPostId: { [Op.ne]: null } },
          { quotedPostId: { [Op.ne]: null } },
        ],
      },
    });
    const response = buildPaginationResponse(page, limit, posts.length, total, posts);
    return res.json(response);
  } catch (err) {
    logger.error('post.user_replies.error', { userId: req.user.id, targetId: req.params.id, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to load replies' });
  }
};

export const userMedia = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ message: 'invalid user id' });
    const targetUser = await loadTargetUser(userId);
    const accessError = await ensureProfileAccess(targetUser, req.user.id);
    if (accessError) return res.status(accessError.status).json(accessError.body);
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '10', 10), 1), 50);
    const { total, posts } = await fetchUserPostsBase({
      userId,
      viewerId: req.user.id,
      page,
      limit,
      includeMediaRequired: true,
    });
    const response = buildPaginationResponse(page, limit, posts.length, total, posts);
    return res.json(response);
  } catch (err) {
    logger.error('post.user_media.error', { userId: req.user.id, targetId: req.params.id, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to load media' });
  }
};

export const userLikes = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ message: 'invalid user id' });
    const targetUser = await loadTargetUser(userId);
    const accessError = await ensureProfileAccess(targetUser, req.user.id);
    if (accessError) return res.status(accessError.status).json(accessError.body);
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '10', 10), 1), 50);
    const offset = (page - 1) * limit;

    const [total, likes] = await Promise.all([
      Like.count({ where: { userId } }),
      Like.findAll({
        where: { userId },
        include: [
          {
            model: Post,
            where: { isArchived: false },
            include: [
              { model: User, attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] },
              { model: AnnouncementType, as: 'announcementType', attributes: ['id', 'typeKey', 'displayName', 'description'] },
              { model: PostMedia, as: 'media' },
              { model: Post, as: 'quotedPost', include: [{ model: User, attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] }] },
              { model: Post, as: 'parentPost', include: [{ model: User, attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] }] },
              { model: PostStats, as: 'stats', attributes: ['postId', 'likeCount', 'commentCount', 'quoteCount', 'viewCount'] },
            ],
          },
        ],
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      }),
    ]);
    const posts = likes.map((like) => like.Post).filter(Boolean);
    const { posts: serialized } = await serializePostsForViewer(posts, req.user.id);
    const response = buildPaginationResponse(page, limit, serialized.length, total, serialized);
    return res.json(response);
  } catch (err) {
    logger.error('post.user_likes.error', { userId: req.user.id, targetId: req.params.id, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to load liked posts' });
  }
};

export const pinPost = async (req, res) => {
  try {
    const postId = Number(req.params.id);
    if (!Number.isInteger(postId) || postId <= 0) return res.status(400).json({ message: 'invalid post id' });
    const post = await Post.findByPk(postId);
    if (!post) return res.status(404).json({ message: 'post not found' });
    if (post.userId !== req.user.id) return res.status(403).json({ message: 'forbidden' });
    await UserPin.findOrCreate({ where: { userId: req.user.id, postId }, defaults: { userId: req.user.id, postId } });
    return res.json({ ok: true });
  } catch (err) {
    logger.error('post.pin.error', { userId: req.user.id, postId: req.params.id, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to pin post' });
  }
};

export const unpinPost = async (req, res) => {
  try {
    const postId = Number(req.params.id);
    if (!Number.isInteger(postId) || postId <= 0) return res.status(400).json({ message: 'invalid post id' });
    const pin = await UserPin.findOne({ where: { userId: req.user.id, postId } });
    if (!pin) return res.status(404).json({ message: 'pin not found' });
    await pin.destroy();
    return res.json({ ok: true });
  } catch (err) {
    logger.error('post.unpin.error', { userId: req.user.id, postId: req.params.id, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to unpin post' });
  }
};

export const savePost = async (req, res) => {
  const startedAt = Date.now();
  try {
    const rawPostId = req.params.id;
    logger.info('post.save.request_received', { userId: req.user.id, rawPostId });
    const postId = Number(rawPostId);
    if (!Number.isInteger(postId) || postId <= 0) {
      logger.info('post.save.validation_failed', { userId: req.user.id, rawPostId, reason: 'invalid_id', durationMs: Date.now() - startedAt });
      return res.status(400).json({ message: 'invalid post id' });
    }
    const lookupStartedAt = Date.now();
    const post = await Post.findOne({ where: { id: postId, isArchived: false } });
    if (!post) {
      logger.info('post.save.not_found', { userId: req.user.id, postId, durationMs: Date.now() - startedAt });
      return res.status(404).json({ message: 'post not found' });
    }
    logger.info('post.save.post_loaded', {
      userId: req.user.id,
      postId,
      ownerId: post.userId,
      lookupDurationMs: Date.now() - lookupStartedAt,
    });
    const [save, created] = await PostSave.findOrCreate({ where: { userId: req.user.id, postId } });
    if (!created) {
      logger.info('post.save.duplicate', { userId: req.user.id, postId, saveId: save.id, durationMs: Date.now() - startedAt });
      return res.status(409).json({ message: 'post already saved' });
    }
    logger.info('post.save.success', { userId: req.user.id, postId, saveId: save.id, durationMs: Date.now() - startedAt });
    return res.json({ ok: true });
  } catch (err) {
    logger.error('post.save.error', { userId: req.user.id, postId: Number(req.params.id), durationMs: Date.now() - startedAt, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to save post' });
  }
};

export const unsavePost = async (req, res) => {
  try {
    const rawPostId = req.params.id;
    logger.info('post.unsave.request_received', { userId: req.user.id, rawPostId });
    const postId = Number(rawPostId);
    if (!Number.isInteger(postId) || postId <= 0) {
      logger.info('post.unsave.validation_failed', { userId: req.user.id, rawPostId, reason: 'invalid_id' });
      return res.status(400).json({ message: 'invalid post id' });
    }
    const post = await Post.findByPk(postId);
    if (!post || post.isArchived) {
      logger.info('post.unsave.not_found', { userId: req.user.id, postId });
      return res.status(404).json({ message: 'post not found' });
    }
    const removed = await PostSave.destroy({ where: { userId: req.user.id, postId } });
    logger.info('post.unsave.success', { userId: req.user.id, postId, removedCount: removed });
    return res.json({ ok: true });
  } catch (err) {
    logger.error('post.unsave.error', { userId: req.user.id, postId: Number(req.params.id), error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to unsave post' });
  }
};

export const savedPosts = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '10', 10), 1), 50);
    const offset = (page - 1) * limit;
    logger.info('post.saved.list.request_received', { userId: req.user.id, page, limit, offset });

    const { count: total, rows } = await PostSave.findAndCountAll({
      where: { userId: req.user.id },
      include: [
        {
          model: Post,
          required: true,
          where: { isArchived: false },
          include: [
            { model: User, attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] },
            { model: AnnouncementType, as: 'announcementType', attributes: ['id', 'typeKey', 'displayName', 'description'] },
            { model: PostMedia, as: 'media' },
            { model: Post, as: 'quotedPost', include: [{ model: User, attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] }] },
            { model: Post, as: 'parentPost', include: [{ model: User, attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] }] },
            { model: PostStats, as: 'stats', attributes: ['postId', 'likeCount', 'commentCount', 'quoteCount', 'viewCount'] },
          ],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true,
    });

    const posts = rows.map((row) => row.Post).filter(Boolean);
    const { posts: serialized, likedCount, followingCount } = await serializePostsForViewer(posts, req.user.id, {
      forceSaved: true,
    });
    logger.info('post.saved.list.viewer_flags_loaded', {
      userId: req.user.id,
      postCount: serialized.length,
      viewerLikes: likedCount,
      viewerFollows: followingCount,
    });
    const returnedCount = serialized.length;
    const hasMore = offset + returnedCount < total;
    const nextPage = hasMore ? page + 1 : null;
    const prevPage = page > 1 ? page - 1 : null;
    const remaining = Math.max(total - (offset + returnedCount), 0);
    let nextCursor = null;
    if (hasMore && serialized[returnedCount - 1]) {
      try {
        const cursorPayload = {
          createdAt: serialized[returnedCount - 1].createdAt,
          id: serialized[returnedCount - 1].id,
        };
        nextCursor = Buffer.from(JSON.stringify(cursorPayload)).toString('base64');
      } catch {
        nextCursor = null;
      }
    }

    logger.info('post.saved.list.success', {
      userId: req.user.id,
      page,
      limit,
      count: returnedCount,
      total,
      hasMore,
      nextPage,
      prevPage,
      remaining,
    });

    return res.json({
      page,
      prevPage,
      nextPage,
      limit,
      count: returnedCount,
      total,
      hasMore,
      nextCursor,
      remaining,
      posts: serialized,
    });
  } catch (err) {
    logger.error('post.saved.list.error', { userId: req.user.id, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to load saved posts' });
  }
};

export const likePost = async (req, res) => {
  try {
    const rawPostId = req.params.id;
    logger.info('post.like.request_received', { userId: req.user.id, rawPostId });
    const postId = Number(rawPostId);
    if (!Number.isInteger(postId) || postId <= 0) {
      logger.info('post.like.validation_failed', { userId: req.user.id, rawPostId, reason: 'invalid_id' });
      return res.status(400).json({ message: 'invalid post id' });
    }
    const post = await Post.findByPk(postId);
    if (!post) {
      logger.info('post.like.not_found', { userId: req.user.id, postId });
      return res.status(404).json({ message: 'post not found' });
    }
    const [, created] = await Like.findOrCreate({ where: { userId: req.user.id, postId } });
    const stats = await adjustPostStats(postId, { likeDelta: created ? 1 : 0 });
    const projected = projectStats(stats);
    logger.info('post.like.success', { userId: req.user.id, postId, created, likeCount: projected.likeCount });
    if (created) {
      await createNotification({
        userId: post.userId,
        actorId: req.user.id,
        type: 'like',
        entityType: 'post',
        entityId: postId,
      });
    }
    return res.json({ ok: true, likeCount: projected.likeCount, viewerHasLiked: true });
  } catch (err) {
    logger.error('post.like.error', { userId: req.user.id, postId: Number(req.params.id), error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to like post' });
  }
};

export const unlikePost = async (req, res) => {
  try {
    const rawPostId = req.params.id;
    logger.info('post.unlike.request_received', { userId: req.user.id, rawPostId });
    const postId = Number(rawPostId);
    if (!Number.isInteger(postId) || postId <= 0) {
      logger.info('post.unlike.validation_failed', { userId: req.user.id, rawPostId, reason: 'invalid_id' });
      return res.status(400).json({ message: 'invalid post id' });
    }
    const removed = await Like.destroy({ where: { userId: req.user.id, postId } });
    let stats;
    if (removed) {
      stats = await adjustPostStats(postId, { likeDelta: -removed });
      logger.info('post.unlike.success', { userId: req.user.id, postId, removedCount: removed });
    } else {
      stats = await getPostStats(postId);
      logger.info('post.unlike.not_found', { userId: req.user.id, postId });
    }
    const projected = projectStats(stats);
    return res.json({ ok: true, likeCount: projected.likeCount, viewerHasLiked: false });
  } catch (err) {
    logger.error('post.unlike.error', { userId: req.user.id, postId: Number(req.params.id), error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to unlike post' });
  }
};

export const comment = async (req, res) => {
  try {
    const rawPostId = req.params.id;
    logger.info('post.comment.request_received', { userId: req.user.id, rawPostId });
    const postId = Number(rawPostId);
    if (!Number.isInteger(postId) || postId <= 0) {
      logger.info('post.comment.validation_failed', { userId: req.user.id, rawPostId, reason: 'invalid_id' });
      return res.status(400).json({ message: 'invalid post id' });
    }
    const post = await Post.findByPk(postId);
    if (!post) {
      logger.info('post.comment.not_found', { userId: req.user.id, postId });
      return res.status(404).json({ message: 'post not found' });
    }
    const sanitizedContent = sanitizeContentInput(req.body?.content);
    if (!sanitizedContent) {
      logger.info('post.comment.validation_failed', { userId: req.user.id, postId, reason: 'missing_content' });
      return res.status(400).json({ message: 'content required' });
    }
    const sanitizedLength = countGraphemes(sanitizedContent);
    logger.info('post.comment.content_validated', { userId: req.user.id, postId, length: sanitizedLength });
    if (sanitizedLength > MAX_POST_LENGTH) {
      logger.info('post.comment.validation_failed', { userId: req.user.id, postId, reason: 'length_exceeded', length: sanitizedLength });
      return res.status(400).json({ message: `comment exceeds ${MAX_POST_LENGTH} characters` });
    }

    const created = await Comment.create({ content: sanitizedContent, postId, userId: req.user.id });
    const stats = await adjustPostStats(postId, { commentDelta: 1 });
    const projected = projectStats(stats);
    logger.info('post.comment.success', {
      userId: req.user.id,
      postId,
      commentId: created.id,
      length: sanitizedLength,
      commentCount: projected.commentCount,
    });
    const payload = typeof created.toJSON === 'function' ? created.toJSON() : { ...created };
    payload.commentCount = projected.commentCount;
    await createNotification({
      userId: post.userId,
      actorId: req.user.id,
      type: 'comment',
      entityType: 'post',
      entityId: postId,
      metadata: { commentId: created.id },
    });
    return res.status(201).json(payload);
  } catch (err) {
    logger.error('post.comment.error', { userId: req.user.id, postId: Number(req.params.id), error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to add comment' });
  }
};

export const listComments = async (req, res) => {
  try {
    const rawPostId = req.params.id;
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const offset = (page - 1) * limit;
    logger.info('post.comments.list.request_received', {
      userId: req.user.id,
      rawPostId,
      page,
      limit,
      offset,
    });
    const postId = Number(rawPostId);
    if (!Number.isInteger(postId) || postId <= 0) {
      logger.info('post.comments.list.validation_failed', { userId: req.user.id, rawPostId, reason: 'invalid_post_id' });
      return res.status(400).json({ message: 'invalid post id' });
    }

    const post = await Post.findByPk(postId, { attributes: ['id'] });
    if (!post) {
      logger.info('post.comments.list.not_found', { userId: req.user.id, postId });
      return res.status(404).json({ message: 'post not found' });
    }

    const where = { postId };
    const [total, comments] = await Promise.all([
      Comment.count({ where }),
      Comment.findAll({
        where,
        include: [{ model: User, attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] }],
        order: [
          ['createdAt', 'ASC'],
          ['id', 'ASC'],
        ],
        offset,
        limit,
      }),
    ]);

    const serialized = comments.map(toPlainComment);
    const count = serialized.length;
    const hasMore = offset + count < total;
    const nextPage = hasMore ? page + 1 : null;
    const prevPage = page > 1 ? page - 1 : null;
    const remaining = Math.max(total - (offset + count), 0);

    logger.info('post.comments.list.success', {
      userId: req.user.id,
      postId,
      page,
      limit,
      count,
      total,
      hasMore,
      nextPage,
      prevPage,
      remaining,
    });

    return res.json({
      page,
      limit,
      count,
      total,
      hasMore,
      nextPage,
      prevPage,
      remaining,
      comments: serialized,
    });
  } catch (err) {
    logger.error('post.comments.list.error', { userId: req.user.id, postId: Number(req.params.id), error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to load comments' });
  }
};

function canManageComment(user, comment, owningPostUserId = null) {
  if (!user || !comment) return false;
  if (comment.userId === user.id) return true;
  if (owningPostUserId && owningPostUserId === user.id) return true;
  if (comment.Post && comment.Post.userId === user.id) return true;
  return isAdmin(user);
}

export const updateComment = async (req, res) => {
  try {
    const postId = Number(req.params.postId);
    const commentId = Number(req.params.commentId);
    logger.info('post.comment.update.request_received', { userId: req.user.id, postId, commentId });
    if (!Number.isInteger(postId) || postId <= 0 || !Number.isInteger(commentId) || commentId <= 0) {
      logger.info('post.comment.update.validation_failed', { userId: req.user.id, postId, commentId, reason: 'invalid_ids' });
      return res.status(400).json({ message: 'invalid post/comment id' });
    }

    const commentInstance = await Comment.findOne({
      where: { id: commentId, postId },
      include: [{ model: Post, attributes: ['id', 'userId'] }],
    });
    if (!commentInstance) {
      logger.info('post.comment.update.not_found', { userId: req.user.id, postId, commentId });
      return res.status(404).json({ message: 'comment not found' });
    }

    if (!canManageComment(req.user, commentInstance, commentInstance.Post?.userId ?? null)) {
      logger.info('post.comment.update.forbidden', { userId: req.user.id, postId, commentId });
      return res.status(403).json({ message: 'forbidden' });
    }

    const sanitizedContent = sanitizeContentInput(req.body?.content);
    if (!sanitizedContent) {
      logger.info('post.comment.update.validation_failed', { userId: req.user.id, postId, commentId, reason: 'missing_content' });
      return res.status(400).json({ message: 'content required' });
    }
    const sanitizedLength = countGraphemes(sanitizedContent);
    if (sanitizedLength > MAX_POST_LENGTH) {
      logger.info('post.comment.update.validation_failed', { userId: req.user.id, postId, commentId, reason: 'length_exceeded', length: sanitizedLength });
      return res.status(400).json({ message: `comment exceeds ${MAX_POST_LENGTH} characters` });
    }

    commentInstance.content = sanitizedContent;
    await commentInstance.save();
    logger.info('post.comment.update.success', { userId: req.user.id, postId, commentId, length: sanitizedLength });
    return res.json(toPlainComment(commentInstance));
  } catch (err) {
    logger.error('post.comment.update.error', { userId: req.user.id, postId: Number(req.params.postId), commentId: Number(req.params.commentId), error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to update comment' });
  }
};

export const deleteComment = async (req, res) => {
  try {
    const postId = Number(req.params.postId);
    const commentId = Number(req.params.commentId);
    logger.info('post.comment.delete.request_received', { userId: req.user.id, postId, commentId });
    if (!Number.isInteger(postId) || postId <= 0 || !Number.isInteger(commentId) || commentId <= 0) {
      logger.info('post.comment.delete.validation_failed', { userId: req.user.id, postId, commentId, reason: 'invalid_ids' });
      return res.status(400).json({ message: 'invalid post/comment id' });
    }

    const commentInstance = await Comment.findOne({
      where: { id: commentId, postId },
      include: [{ model: Post, attributes: ['id', 'userId'] }],
    });
    if (!commentInstance) {
      logger.info('post.comment.delete.not_found', { userId: req.user.id, postId, commentId });
      return res.status(404).json({ message: 'comment not found' });
    }

    if (!canManageComment(req.user, commentInstance, commentInstance.Post?.userId ?? null)) {
      logger.info('post.comment.delete.forbidden', { userId: req.user.id, postId, commentId });
      return res.status(403).json({ message: 'forbidden' });
    }

    await commentInstance.destroy();
    const stats = await adjustPostStats(postId, { commentDelta: -1 });
    const projected = projectStats(stats);
    logger.info('post.comment.delete.success', {
      userId: req.user.id,
      postId,
      commentId,
      commentCount: projected.commentCount,
    });
    return res.status(204).send();
  } catch (err) {
    logger.error('post.comment.delete.error', { userId: req.user.id, postId: Number(req.params.postId), commentId: Number(req.params.commentId), error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to delete comment' });
  }
};

export const archivePost = async (req, res) => {
  try {
    const rawPostId = req.params.id;
    logger.info('post.archive.request_received', { userId: req.user.id, rawPostId, reason: req.body?.reason ?? null });
    const postId = Number(rawPostId);
    if (!Number.isInteger(postId) || postId <= 0) {
      logger.info('post.archive.validation_failed', { userId: req.user.id, rawPostId, reason: 'invalid_id' });
      return res.status(400).json({ message: 'invalid post id' });
    }

    const post = await Post.findByPk(postId);
    if (!post) {
      logger.info('post.archive.not_found', { userId: req.user.id, postId });
      return res.status(404).json({ message: 'post not found' });
    }
    if (!canManagePost(req.user, post)) {
      logger.info('post.archive.forbidden', { userId: req.user.id, postId });
      return res.status(403).json({ message: 'forbidden' });
    }
    if (post.isArchived) {
      logger.info('post.archive.already_archived', { userId: req.user.id, postId });
      return res.status(409).json({ message: 'post already archived' });
    }

    post.isArchived = true;
    post.archivedAt = new Date();
    post.archivedBy = `user:${req.user.id}`;
    const archiveReason = normalizeReason(req.body?.reason);
    post.archiveReason = archiveReason;
    await post.save();

    logger.info('post.archive.success', {
      userId: req.user.id,
      postId,
      archivedAt: post.archivedAt?.toISOString?.() ?? post.archivedAt,
      archiveReason,
    });
    return res.json({
      ok: true,
      post: {
        id: post.id,
        isArchived: post.isArchived,
        archivedAt: post.archivedAt,
        archivedBy: post.archivedBy,
        archiveReason: post.archiveReason,
      },
    });
  } catch (err) {
    logger.error('post.archive.error', { userId: req.user.id, postId: Number(req.params.id), error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to archive post' });
  }
};

export const restorePost = async (req, res) => {
  try {
    const rawPostId = req.params.id;
    logger.info('post.restore.request_received', { userId: req.user.id, rawPostId });
    const postId = Number(rawPostId);
    if (!Number.isInteger(postId) || postId <= 0) {
      logger.info('post.restore.validation_failed', { userId: req.user.id, rawPostId, reason: 'invalid_id' });
      return res.status(400).json({ message: 'invalid post id' });
    }

    const post = await Post.findByPk(postId);
    if (!post) {
      logger.info('post.restore.not_found', { userId: req.user.id, postId });
      return res.status(404).json({ message: 'post not found' });
    }
    if (!canManagePost(req.user, post)) {
      logger.info('post.restore.forbidden', { userId: req.user.id, postId });
      return res.status(403).json({ message: 'forbidden' });
    }
    if (!post.isArchived) {
      logger.info('post.restore.not_archived', { userId: req.user.id, postId });
      return res.status(409).json({ message: 'post is not archived' });
    }

    const previouslyArchivedAt = post.archivedAt;
    post.isArchived = false;
    post.archivedAt = null;
    post.archivedBy = null;
    post.archiveReason = null;
    await post.save();

    logger.info('post.restore.success', {
      userId: req.user.id,
      postId,
      previouslyArchivedAt: previouslyArchivedAt?.toISOString?.() ?? previouslyArchivedAt,
    });
    return res.json({ ok: true, post: { id: post.id, isArchived: post.isArchived } });
  } catch (err) {
    logger.error('post.restore.error', { userId: req.user.id, postId: Number(req.params.id), error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to restore post' });
  }
};

export const deletePost = async (req, res) => {
  try {
    const rawPostId = req.params.id;
    logger.info('post.delete.request_received', { userId: req.user.id, rawPostId });
    const postId = Number(rawPostId);
    if (!Number.isInteger(postId) || postId <= 0) {
      logger.info('post.delete.validation_failed', { userId: req.user.id, rawPostId, reason: 'invalid_id' });
      return res.status(400).json({ message: 'invalid post id' });
    }

    const post = await Post.findByPk(postId);
    if (!post) {
      logger.info('post.delete.not_found', { userId: req.user.id, postId });
      return res.status(404).json({ message: 'post not found' });
    }
    if (!canManagePost(req.user, post)) {
      logger.info('post.delete.forbidden', { userId: req.user.id, postId });
      return res.status(403).json({ message: 'forbidden' });
    }

    await deleteMediaForPost(post.id);
    logger.info('post.delete.media_cleanup_requested', { postId });
    await post.destroy();
    logger.info('post.delete.success', { userId: req.user.id, postId, deletedBy: req.user.id });
    return res.status(204).send();
  } catch (err) {
    logger.error('post.delete.error', { userId: req.user.id, postId: Number(req.params.id), error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to delete post' });
  }
};

