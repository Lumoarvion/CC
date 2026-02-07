import path from 'node:path';
import { logger } from '../utils/logger.js';
import { buildObjectKey, buildPublicUrl, createPresignedPutUrl } from '../utils/r2Client.js';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

const EXTENSION_FALLBACKS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
};

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB

function normalizeMime(value) {
  if (typeof value !== 'string') return '';
  return value.toLowerCase().trim();
}

function resolveExtension(filename, mime) {
  const ext = path.extname(filename || '').toLowerCase();
  if (ext) return ext;
  return EXTENSION_FALLBACKS[mime] || '';
}

function serializeForLog(value) {
  try {
    if (value === undefined) return undefined;
    const json = JSON.stringify(value);
    if (json === undefined) return undefined;
    return JSON.parse(json);
  } catch {
    return '[unserializable]';
  }
}

export async function createPresignedUpload(req, res) {
  const { filename, contentType, size } = req.body || {};
  const actorId = req.user?.id ?? null;
  const trimmedFilename = typeof filename === 'string' ? filename.trim() : '';
  const normalizedContentType = typeof contentType === 'string' ? contentType.trim() : '';
  const sizeProvided = size !== undefined;
  const numericSize = sizeProvided ? Number(size) : undefined;

  const baseLog = {
    actorId,
    filename: trimmedFilename || undefined,
    contentType: normalizedContentType || undefined,
    size: Number.isFinite(numericSize) ? numericSize : undefined,
  };

  logger.info('media.presign.request.received', baseLog);
  logger.info('media.presign.request.body', {
    actorId,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    body: serializeForLog(req.body),
  });

  if (!actorId) {
    logger.warn('media.presign.unauthorized', baseLog);
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (!trimmedFilename) {
    logger.warn('media.presign.validation_failed', { ...baseLog, reason: 'missing-filename' });
    return res.status(400).json({ message: 'filename is required' });
  }

  const mime = normalizeMime(contentType);
  if (!mime) {
    logger.warn('media.presign.validation_failed', { ...baseLog, reason: 'missing-contentType' });
    return res.status(400).json({ message: 'contentType is required' });
  }

  if (!ALLOWED_MIME_TYPES.has(mime)) {
    logger.warn('media.presign.validation_failed', { ...baseLog, reason: 'unsupported-contentType', mime });
    return res.status(400).json({ message: 'Unsupported content type' });
  }

  if (sizeProvided) {
    if (!Number.isFinite(numericSize) || numericSize <= 0) {
      logger.warn('media.presign.validation_failed', { ...baseLog, reason: 'invalid-size', providedSize: size });
      return res.status(400).json({ message: 'size must be a positive number' });
    }
    if (numericSize > MAX_UPLOAD_BYTES) {
      logger.warn('media.presign.validation_failed', { ...baseLog, reason: 'size-exceeds-limit', providedSize: numericSize, maxUploadBytes: MAX_UPLOAD_BYTES });
      return res.status(400).json({ message: `File exceeds ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit` });
    }
  }

  let extension;
  let key;
  try {
    extension = resolveExtension(trimmedFilename, mime);
    key = buildObjectKey({
      userId: actorId,
      extension,
      prefix: mime.startsWith('video/') ? 'videos' : 'images',
    });

    logger.info('media.presign.issue', { ...baseLog, mime, extension, key });

    const presign = await createPresignedPutUrl({ key, contentType: mime });
    const publicUrl = buildPublicUrl(key);

    logger.info('media.presign.success', {
      ...baseLog,
      mime,
      key,
      expiresIn: presign.expiresIn,
    });

    return res.json({
      uploadUrl: presign.uploadUrl,
      expiresIn: presign.expiresIn,
      objectKey: key,
      publicUrl,
      contentType: mime,
      maxUploadBytes: MAX_UPLOAD_BYTES,
    });
  } catch (err) {
    logger.error('media.presign.error', {
      ...baseLog,
      mime,
      key,
      error: err instanceof Error ? err.message : String(err),
    });
    return res.status(500).json({ message: 'Failed to prepare upload' });
  }
}
