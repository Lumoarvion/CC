import { Post, AnnouncementType, User, PostMedia } from '../models/index.js';
import { logger } from '../utils/logger.js';
import { buildAnnouncementScope, normalizeAudienceScope } from '../utils/audienceScope.js';
import { normalizePostMediaInput, attachMediaToPost, replacePostMedia, serializeMedia, deleteMediaForPost } from '../utils/postMedia.js';

function computeAvatarInitial(user) {
  const base = (user?.fullName || user?.username || '').trim();
  if (!base) return null;
  return base.charAt(0).toUpperCase();
}

function parsePinnedUntil(pinnedUntil) {
  if (pinnedUntil === undefined) return undefined;
  if (pinnedUntil === null || pinnedUntil === '') return null;
  const parsed = new Date(pinnedUntil);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('pinnedUntil must be a valid date');
  }
  return parsed;
}

function ensureAnnouncementType(typeId) {
  if (!Number.isInteger(typeId) || typeId <= 0) {
    throw new Error('announcementTypeId must be a positive integer');
  }
}

function sanitizeContent(content) {
  const trimmed = typeof content === 'string' ? content.trim() : '';
  if (!trimmed) {
    throw new Error('content is required');
  }
  return trimmed;
}

function normalizeArchiveReason(reason) {
  if (typeof reason !== 'string') return null;
  const trimmed = reason.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 255);
}

function serializeAnnouncement(post) {
  const plain = typeof post.toJSON === 'function' ? post.toJSON() : { ...post };
  plain.audienceScope = normalizeAudienceScope(plain.audienceScope);
  plain.media = serializeMedia(plain.media || plain.Media || []);
  delete plain.Media;

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
    plain.createdBy = {
      id: plain.User.id,
      fullName: plain.User.fullName,
      username: plain.User.username,
      avatarUrl: plain.User.avatarUrl,
      avatarUrlFull: plain.User.avatarUrlFull,
      avatarInitial: computeAvatarInitial(plain.User),
    };
    delete plain.User;
  }

  return plain;
}

export async function createAnnouncement(req, res) {
  try {
    const { content, attachments: rawAttachments, announcementTypeId, pinnedUntil } = req.body || {};

    const sanitizedContent = sanitizeContent(content);
    const typeId = Number(announcementTypeId);
    ensureAnnouncementType(typeId);

    const [type, actor] = await Promise.all([
      AnnouncementType.findOne({ where: { id: typeId, isActive: true } }),
      User.findByPk(req.user.id, { attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] }),
    ]);

    if (!type) {
      logger.info('announcement.create.invalid_type', { actorId: req.user.id, announcementTypeId: typeId });
      return res.status(400).json({ message: 'Invalid or inactive announcement type' });
    }

    let pinned;
    try {
      pinned = parsePinnedUntil(pinnedUntil);
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    let attachments = [];
    try {
      attachments = normalizePostMediaInput(rawAttachments);
    } catch (err) {
      logger.info('announcement.create.validation_failed', {
        actorId: req.user.id,
        reason: err instanceof Error ? err.message : String(err),
      });
      return res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }

    const scope = buildAnnouncementScope({ announcementType: type, content: sanitizedContent });

    const announcement = await Post.create({
      content: sanitizedContent,
      postType: 'announcement',
      announcementTypeId: type.id,
      pinnedUntil: pinned === undefined ? null : pinned,
      audienceScope: scope,
      userId: req.user.id,
    });

    await attachMediaToPost(announcement.id, attachments);

    const withRelations = await Post.findByPk(announcement.id, {
      include: [
        { model: AnnouncementType, as: 'announcementType', attributes: ['id', 'typeKey', 'displayName', 'description'] },
        { model: User, attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] },
        { model: PostMedia, as: 'media' },
      ],
    });

    if (!withRelations?.User && actor) {
      announcement.User = actor;
    }

    logger.info('announcement.create.success', { actorId: req.user.id, announcementId: announcement.id, announcementTypeId: type.id });
    return res.status(200).json({ ok: true, announcement: serializeAnnouncement(withRelations ?? announcement) });
  } catch (err) {
    logger.error('announcement.create.error', { actorId: req.user.id, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to create announcement' });
  }
}

export async function listAnnouncements(req, res) {
  const page = Math.max(parseInt(req.query.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || '10', 10), 1), 100);
  const offset = (page - 1) * limit;
  const includeArchived = String(req.query.includeArchived || 'false').toLowerCase() === 'true';

  try {
    const { rows, count } = await Post.findAndCountAll({
      where: {
        postType: 'announcement',
        ...(includeArchived ? {} : { isArchived: false }),
      },
      include: [
        { model: AnnouncementType, as: 'announcementType', attributes: ['id', 'typeKey', 'displayName', 'description'] },
        { model: User, attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] },
        { model: PostMedia, as: 'media' },
      ],
      order: [
        ['isArchived', 'ASC'],
        ['pinnedUntil', 'DESC'],
        ['createdAt', 'DESC'],
      ],
      limit,
      offset,
    });

    const announcements = rows.map(serializeAnnouncement);
    logger.info('announcement.list.success', { actorId: req.user.id, page, count });
    return res.json({ page, limit, total: count, announcements });
  } catch (err) {
    logger.error('announcement.list.error', { actorId: req.user.id, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to retrieve announcements' });
  }
}

export async function listPublicAnnouncements(req, res) {
  const page = Math.max(parseInt(req.query.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || '10', 10), 1), 100);
  const offset = (page - 1) * limit;

  try {
    const { rows, count } = await Post.findAndCountAll({
      where: {
        postType: 'announcement',
        isArchived: false,
      },
      include: [
        { model: AnnouncementType, as: 'announcementType', attributes: ['id', 'typeKey', 'displayName', 'description'] },
        { model: User, attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] },
        { model: PostMedia, as: 'media' },
      ],
      order: [
        ['pinnedUntil', 'DESC'],
        ['createdAt', 'DESC'],
      ],
      limit,
      offset,
    });

    const announcements = rows.map(serializeAnnouncement);
    logger.info('announcement.list_public.success', { actorId: req.user.id, page, count });
    return res.json({ page, limit, total: count, announcements });
  } catch (err) {
    logger.error('announcement.list_public.error', { actorId: req.user.id, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to retrieve announcements' });
  }
}

export async function updateAnnouncement(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'Invalid announcement id' });
  }

  const { content, attachments: rawAttachments, announcementTypeId, pinnedUntil } = req.body || {};

  try {
    const announcement = await Post.findOne({
      where: { id, postType: 'announcement' },
      include: [
        { model: AnnouncementType, as: 'announcementType', attributes: ['id', 'typeKey', 'displayName', 'description'] },
        { model: User, attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] },
        { model: PostMedia, as: 'media' },
      ],
    });

    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    const updates = {};
    let nextType = announcement.announcementType || null;

    if (content !== undefined) {
      updates.content = sanitizeContent(content);
    }

    if (pinnedUntil !== undefined) {
      try {
        updates.pinnedUntil = parsePinnedUntil(pinnedUntil);
      } catch (err) {
        return res.status(400).json({ message: err.message });
      }
    }

    if (announcementTypeId !== undefined) {
      const typeId = Number(announcementTypeId);
      ensureAnnouncementType(typeId);
      const type = await AnnouncementType.findOne({ where: { id: typeId, isActive: true } });
      if (!type) {
        return res.status(400).json({ message: 'Invalid or inactive announcement type' });
      }
      updates.announcementTypeId = type.id;
      nextType = type;
    }

    const hasAttachmentsField = Object.prototype.hasOwnProperty.call(req.body || {}, 'attachments');
    let updatedAttachments = null;
    if (hasAttachmentsField) {
      try {
        updatedAttachments = normalizePostMediaInput(rawAttachments);
      } catch (err) {
        logger.info('announcement.update.validation_failed', {
          actorId: req.user.id,
          announcementId: id,
          reason: err instanceof Error ? err.message : String(err),
        });
        return res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
      }
    }

    if (Object.keys(updates).length === 0) {
      logger.info('announcement.update.no_changes', { actorId: req.user.id, announcementId: id });
      return res.status(400).json({ message: 'No changes provided' });
    }

    const updatedContent = updates.content ?? announcement.content;
    const scope = buildAnnouncementScope({ announcementType: nextType, content: updatedContent });
    announcement.set({ ...updates, audienceScope: scope });
    await announcement.save();

    if (updatedAttachments !== null) {
      await replacePostMedia(announcement.id, updatedAttachments);
    }

    await announcement.reload({
      include: [
        { model: AnnouncementType, as: 'announcementType', attributes: ['id', 'typeKey', 'displayName', 'description'] },
        { model: User, attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] },
        { model: PostMedia, as: 'media' },
      ],
    });

    logger.info('announcement.update.success', { actorId: req.user.id, announcementId: announcement.id, announcementTypeId: announcement.announcementTypeId });
    return res.json({ ok: true, announcement: serializeAnnouncement(announcement) });
  } catch (err) {
    logger.error('announcement.update.error', { actorId: req.user.id, announcementId: id, error: err instanceof Error ? err.message : String(err) });
    if (err instanceof Error && err.message.includes('announcementTypeId')) {
      return res.status(400).json({ message: err.message });
    }
    return res.status(500).json({ message: 'Failed to update announcement' });
  }
}

export async function archiveAnnouncement(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    logger.info('announcement.archive.invalid_id', { actorId: req.user.id, announcementId: req.params.id });
    return res.status(400).json({ message: 'Invalid announcement id' });
  }

  try {
    const announcement = await Post.findOne({ where: { id, postType: 'announcement' } });
    if (!announcement) {
      logger.info('announcement.archive.not_found', { actorId: req.user.id, announcementId: id });
      return res.status(404).json({ message: 'Announcement not found' });
    }
    if (announcement.isArchived) {
      logger.info('announcement.archive.already_archived', { actorId: req.user.id, announcementId: id });
      return res.status(409).json({ message: 'Announcement already archived' });
    }

    announcement.isArchived = true;
    announcement.archivedAt = new Date();
    announcement.archivedBy = `user:${req.user.id}`;
    announcement.archiveReason = normalizeArchiveReason(req.body?.reason);
    await announcement.save();

    logger.info('announcement.archive.success', { actorId: req.user.id, announcementId: id });
    return res.json({ ok: true, announcement: serializeAnnouncement(announcement) });
  } catch (err) {
    logger.error('announcement.archive.error', { actorId: req.user.id, announcementId: id, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to archive announcement' });
  }
}

export async function restoreAnnouncement(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    logger.info('announcement.restore.invalid_id', { actorId: req.user.id, announcementId: req.params.id });
    return res.status(400).json({ message: 'Invalid announcement id' });
  }

  try {
    const announcement = await Post.findOne({ where: { id, postType: 'announcement' } });
    if (!announcement) {
      logger.info('announcement.restore.not_found', { actorId: req.user.id, announcementId: id });
      return res.status(404).json({ message: 'Announcement not found' });
    }
    if (!announcement.isArchived) {
      logger.info('announcement.restore.not_archived', { actorId: req.user.id, announcementId: id });
      return res.status(409).json({ message: 'Announcement is not archived' });
    }

    announcement.isArchived = false;
    announcement.archivedAt = null;
    announcement.archivedBy = null;
    announcement.archiveReason = null;
    await announcement.save();

    logger.info('announcement.restore.success', { actorId: req.user.id, announcementId: id });
    return res.json({ ok: true, announcement: serializeAnnouncement(announcement) });
  } catch (err) {
    logger.error('announcement.restore.error', { actorId: req.user.id, announcementId: id, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to restore announcement' });
  }
}

export async function deleteAnnouncement(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    logger.info('announcement.delete.invalid_id', { actorId: req.user.id, announcementId: req.params.id });
    return res.status(400).json({ message: 'Invalid announcement id' });
  }

  try {
    const announcement = await Post.findOne({ where: { id, postType: 'announcement' } });
    if (!announcement) {
      logger.info('announcement.delete.not_found', { actorId: req.user.id, announcementId: id });
      return res.status(404).json({ message: 'Announcement not found' });
    }

    await deleteMediaForPost(announcement.id);
    await announcement.destroy();

    logger.info('announcement.delete.success', { actorId: req.user.id, announcementId: id });
    return res.status(204).send();
  } catch (err) {
    logger.error('announcement.delete.error', { actorId: req.user.id, announcementId: id, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to delete announcement' });
  }
}

