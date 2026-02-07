import PostMedia from '../models/PostMedia.js';
import { deleteObject } from './r2Client.js';
import { logger } from './logger.js';

const MAX_MEDIA_ITEMS = 5;
const MEDIA_TYPES = new Set(['image', 'gif', 'video']);

export function validateMediaUrl(url) {
  if (url === null || url === undefined) return null;
  if (typeof url !== 'string') {
    throw new Error('media URL must be a string');
  }
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.length > 2048) {
    throw new Error('media URL too long');
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      throw new Error('media URL must use https');
    }
    return parsed.toString();
  } catch (err) {
    throw new Error('invalid media URL');
  }
}

export function validateAttachmentsPayload(raw) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new Error('attachments must be an array');
  }
  if (raw.length === 0) return [];
  if (raw.length > MAX_MEDIA_ITEMS) {
    throw new Error('too many attachments');
  }

  const normalized = raw.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`attachment ${index} must be an object`);
    }
    const { type, url, metadata } = item;
    if (typeof type !== 'string') {
      throw new Error(`attachment ${index} missing type`);
    }
    const normalizedType = type.toLowerCase();
    if (!MEDIA_TYPES.has(normalizedType)) {
      throw new Error(`attachment ${index} has unsupported type`);
    }
    const normalizedUrl = validateMediaUrl(url ?? null);
    if (!normalizedUrl) {
      throw new Error(`attachment ${index} must include url`);
    }
    const safeMetadata = metadata && typeof metadata === 'object' ? metadata : {};
    return {
      type: normalizedType,
      url: normalizedUrl,
      metadata: safeMetadata,
    };
  });

  const hasVideo = normalized.some((item) => item.type === 'video');
  const hasGif = normalized.some((item) => item.type === 'gif');
  if (hasVideo && normalized.length > 1) {
    throw new Error('video posts may include only one attachment');
  }
  if (hasGif && normalized.length > 1) {
    throw new Error('gif posts may include only one attachment');
  }
  if (hasVideo && hasGif) {
    throw new Error('cannot mix video and gif attachments');
  }

  return normalized;
}

export function normalizePostMediaInput(rawAttachments) {
  const attachmentsCount = Array.isArray(rawAttachments) ? rawAttachments.length : rawAttachments ? 1 : 0;
  logger.info('post.media.normalize.start', { attachmentsCount });
  try {
    const normalized = validateAttachmentsPayload(rawAttachments);
    logger.info('post.media.normalize.success', {
      attachmentsCount: normalized.length,
      attachmentTypes: normalized.map((item) => item.type),
    });
    return normalized;
  } catch (err) {
    logger.info('post.media.normalize.failed', {
      attachmentsCount,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export function serializeMedia(mediaInstances) {
  if (!Array.isArray(mediaInstances)) return [];
  return mediaInstances.map((media) => ({
    id: media.id,
    type: media.type,
    url: media.url,
    metadata: media.metadata || {},
  }));
}

export async function attachMediaToPost(postId, attachments) {
  const attachmentsCount = attachments?.length ?? 0;
  logger.info('post.media.attach.start', { postId, attachmentsCount });
  if (!attachmentsCount) {
    logger.info('post.media.attach.skipped', { postId });
    return;
  }
  await PostMedia.bulkCreate(
    attachments.map((item, idx) => ({
      postId,
      type: item.type,
      url: item.url,
      metadata: { order: idx, ...item.metadata },
    }))
  );
  logger.info('post.media.attach.success', { postId, attachmentsCount });
}

export async function replacePostMedia(postId, attachments) {
  logger.info('post.media.replace.start', { postId, nextCount: attachments?.length ?? 0 });
  const existing = await PostMedia.findAll({ where: { postId } });
  logger.info('post.media.replace.existing_loaded', { postId, existingCount: existing.length });
  let remoteDeleted = 0;
  let remoteDeleteFailures = 0;
  if (existing.length > 0) {
    await Promise.all(
      existing.map(async (media) => {
        const key = media?.metadata?.r2Key;
        if (typeof key === 'string' && key.trim()) {
          try {
            await deleteObject(key);
            remoteDeleted += 1;
            logger.info('post.media.replace.remote_deleted', { postId, mediaId: media.id, key });
          } catch {
            remoteDeleteFailures += 1;
            logger.warn('post.media.replace.remote_delete_failed', { postId, mediaId: media.id, key });
          }
        }
      })
    );
  }
  await PostMedia.destroy({ where: { postId } });
  logger.info('post.media.replace.local_cleared', { postId, removedCount: existing.length, remoteDeleted, remoteDeleteFailures });
  if (attachments?.length) {
    await attachMediaToPost(postId, attachments);
    logger.info('post.media.replace.reseeded', { postId, nextCount: attachments.length });
  } else {
    logger.info('post.media.replace.reseed_skipped', { postId });
  }
}

export async function deleteMediaForPost(postId) {
  logger.info('post.media.delete.start', { postId });
  const existing = await PostMedia.findAll({ where: { postId } });
  if (existing.length === 0) {
    logger.info('post.media.delete.none_found', { postId });
    return;
  }
  let remoteDeleted = 0;
  let remoteDeleteFailures = 0;
  await Promise.all(
    existing.map(async (media) => {
      const key = media?.metadata?.r2Key;
      if (typeof key === 'string' && key.trim()) {
        try {
          await deleteObject(key);
          remoteDeleted += 1;
          logger.info('post.media.delete.remote_deleted', { postId, mediaId: media.id, key });
        } catch {
          remoteDeleteFailures += 1;
          logger.warn('post.media.delete.remote_delete_failed', { postId, mediaId: media.id, key });
        }
      }
    })
  );
  await PostMedia.destroy({ where: { postId } });
  logger.info('post.media.delete.success', {
    postId,
    removedCount: existing.length,
    remoteDeleted,
    remoteDeleteFailures,
  });
}

export const MEDIA_CONSTRAINTS = {
  MAX_MEDIA_ITEMS,
  SUPPORTED_TYPES: Array.from(MEDIA_TYPES),
};
