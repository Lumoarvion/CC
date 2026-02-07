import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sequelize } from '../db.js';
import User from '../models/User.js';
import { logger } from '../utils/logger.js';
import { sendDeletionOtpEmail, sendDeletionCompletedEmail } from '../utils/mailer.js';
import UserDeleteArchive from '../models/UserDeleteArchive.js';

const DELETE_OTP_TTL_MIN = Number(process.env.DELETE_OTP_TTL_MIN || 15);

function nowUtc() {
  return new Date();
}

function clientIp(req) {
  const header = req.headers['x-forwarded-for'];
  if (header && typeof header === 'string') {
    return header.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
}

function normalizeReason(reason) {
  if (!reason) return null;
  const trimmed = String(reason).trim();
  return trimmed.length ? trimmed.slice(0, 2000) : null;
}

function generateOtp() {
  return String(crypto.randomInt(0, 10_000)).padStart(4, '0');
}

function hashOtp(otp) {
  return crypto.createHash('sha256').update(String(otp), 'utf8').digest('hex');
}

function generateRequestId() {
  return crypto.randomBytes(16).toString('hex');
}

function safeToken(value, fallback = 'user') {
  if (value === undefined || value === null) return fallback;
  const cleaned = String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function buildAnonymizedSlug(userId) {
  const idPart = safeToken(userId, 'user');
  const randomPart = crypto.randomBytes(6).toString('hex');
  const slug = `deleted-user-${idPart}-${randomPart}`;
  return slug.length > 120 ? slug.slice(0, 120) : slug;
}

function buildDeletedEmail(userId) {
  const idPart = safeToken(userId, 'user');
  const randomPart = crypto.randomBytes(5).toString('hex');
  const email = `deleted+${idPart}.${randomPart}@deleted.local`;
  return email.length > 254 ? email.slice(0, 254) : email;
}

function buildDeletedUsername(userId) {
  const idPart = safeToken(userId, 'user').replace(/-/g, '_');
  const randomPart = crypto.randomBytes(4).toString('hex');
  const username = `deleted_${idPart}_${randomPart}`;
  return username.length > 60 ? username.slice(0, 60) : username;
}

async function performUserDeletion({ user, reason, trx, requestId = null, trigger = 'self' }) {
  const sanitizedAt = nowUtc();
  const anonymizedSlug = buildAnonymizedSlug(user.id);
  const deletedEmail = buildDeletedEmail(user.id);
  const deletedUsername = buildDeletedUsername(user.id);
  const randomPasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
  const normalizedReason = reason ?? user.deleteReason ?? null;
  const meta = {
    ...(user.meta || {}),
    deletedAt: sanitizedAt.toISOString(),
    deleteReason: normalizedReason,
    deleteTrigger: trigger,
  };

  await UserDeleteArchive.create(
    {
      userId: user.id,
      snapshot: user.toJSON(),
      reason: normalizedReason,
      requestedAt: user.deleteRequestedAt,
      confirmedAt: sanitizedAt,
    },
    { transaction: trx }
  );

  await user.update(
    {
      email: deletedEmail,
      username: deletedUsername,
      fullName: null,
      bio: null,
      gender: null,
      degreeId: null,
      staffDesignationId: null,
      empId: null,
      studentId: null,
      avatarUrl: null,
      avatarUrlFull: null,
      passwordHash: randomPasswordHash,
      accountStatus: 'deleted',
      loginDisabled: true,
      deleteReason: normalizedReason,
      deleteConfirmedAt: sanitizedAt,
      deleteCompletedAt: sanitizedAt,
      deleteScheduledAt: sanitizedAt,
      deleteOtpHash: null,
      deleteOtpExpiresAt: null,
      deleteRequestId: null,
      anonymizedSlug,
      sanitizedAt,
      jwtVersion: user.jwtVersion + 1,
      domain: 'deleted.local',
      emailVerified: false,
      emailVerifiedBy: null,
      deleteCancelledAt: null,
      meta,
    },
    { transaction: trx }
  );

  logger.info('delete.perform.sanitized', {
    userId: user.id,
    requestId,
    trigger,
    anonymizedSlug,
    deletedEmail,
  });

  return { sanitizedAt, anonymizedSlug, deletedEmail, deletedUsername, normalizedReason };
}

export async function requestAccountDelete(req, res) {
  let requestId = null;
  let otp = null;
  let expiresAt = null;
  try {
    const userId = req.user?.id;
    const { password, reason } = req.body || {};

    if (!password) {
      logger.info('delete.request.validation_failed', { userId, reason: 'missing_password' });
      return res.status(400).json({ message: 'Password is required' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      logger.warn('delete.request.user_not_found', { userId });
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.accountStatus === 'deleted' || user.loginDisabled) {
      logger.info('delete.request.already_deleted', { userId });
      return res.status(410).json({ message: 'Account already deleted' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      logger.info('delete.request.bad_password', { userId });
      return res.status(401).json({ message: 'Invalid password' });
    }

    requestId = generateRequestId();
    otp = generateOtp();
    const otpHash = hashOtp(otp);
    expiresAt = new Date(Date.now() + DELETE_OTP_TTL_MIN * 60 * 1000);
    const reasonValue = normalizeReason(reason);
    const ip = clientIp(req);
    const ua = req.headers['user-agent'] || null;

    await user.update({
      deleteReason: reasonValue,
      deleteRequestedAt: nowUtc(),
      deleteRequestId: requestId,
      deleteRequestIp: ip,
      deleteRequestUserAgent: ua,
      deleteOtpHash: otpHash,
      deleteOtpExpiresAt: expiresAt,
      deleteConfirmedAt: null,
      deleteCancelledAt: null,
      deleteCompletedAt: null,
      deleteScheduledAt: null,
      accountStatus: 'delete_requested',
      loginDisabled: false,
    });

    await sendDeletionOtpEmail({
      to: user.email,
      name: user.fullName || user.username || 'there',
      otp,
      expiresAt,
      reason: reasonValue,
    });

    const includeOtpInResponse =
      String(process.env.INCLUDE_OTP_IN_RESPONSE || '').toLowerCase() === 'true' ||
      String(process.env.NODE_ENV || '').toLowerCase() !== 'production';

    logger.info('delete.request.created', {
      userId,
      requestId,
      otp,
      expiresAt: expiresAt.toISOString(),
      reason: reasonValue,
      ip,
      userAgent: ua,
      otpIncludedInResponse: includeOtpInResponse,
    });

    const responsePayload = {
      requestId,
      expiresAt: expiresAt.toISOString(),
    };
    if (includeOtpInResponse) {
      responsePayload.otp = otp;
    }

    logger.info('delete.request.response_ready', {
      userId,
      requestId,
      includesOtp: includeOtpInResponse,
    });

    return res.status(200).json(responsePayload);
  } catch (err) {
    logger.error('delete.request.error', {
      userId: req.user?.id,
      requestId,
      error: String(err),
    });
    return res.status(500).json({ message: 'Failed to request account deletion' });
  }
}

export async function confirmAccountDelete(req, res) {
  const userId = req.user?.id;
  const trx = await sequelize.transaction();
  let committed = false;
  let sanitizedAt;
  let originalEmail;
  let originalName;
  let deleteReason = null;
  let normalizedRequestId = '';
  let normalizedOtp = '';

  try {
    const { requestId, otp } = req.body || {};

    normalizedRequestId = requestId != null ? String(requestId).trim() : '';
    normalizedOtp = otp != null ? String(otp).trim() : '';

    logger.info('delete.confirm.received', { userId, requestId: normalizedRequestId, otp: normalizedOtp });

    if (!normalizedRequestId || !normalizedOtp) {
      logger.info('delete.confirm.validation_failed', { userId, requestId: normalizedRequestId, reason: 'missing_fields' });
      await trx.rollback();
      return res.status(400).json({ message: 'requestId and otp are required' });
    }

    const user = await User.findByPk(userId, { transaction: trx, lock: trx.LOCK.UPDATE });
    if (!user) {
      logger.warn('delete.confirm.user_not_found', { userId, requestId: normalizedRequestId });
      await trx.rollback();
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.accountStatus === 'deleted') {
      logger.info('delete.confirm.already_deleted', { userId, requestId: normalizedRequestId });
      await trx.rollback();
      return res.status(410).json({ message: 'Account already deleted' });
    }

    const storedRequestId = user.deleteRequestId ? String(user.deleteRequestId).trim() : '';
    if (user.accountStatus !== 'delete_requested' || !storedRequestId) {
      logger.info('delete.confirm.no_pending_request', { userId, requestId: normalizedRequestId });
      await trx.rollback();
      return res.status(400).json({ message: 'No pending deletion request' });
    }

    if (storedRequestId !== normalizedRequestId) {
      logger.info('delete.confirm.bad_request_id', { userId, storedRequestId, providedRequestId: normalizedRequestId });
      await trx.rollback();
      return res.status(400).json({ message: 'Invalid requestId or otp' });
    }

    if (!user.deleteOtpHash || !user.deleteOtpExpiresAt) {
      logger.info('delete.confirm.missing_otp_state', { userId, requestId: normalizedRequestId });
      await trx.rollback();
      return res.status(400).json({ message: 'No pending deletion request' });
    }

    if (new Date(user.deleteOtpExpiresAt).getTime() < Date.now()) {
      logger.info('delete.confirm.otp_expired', {
        userId,
        requestId: normalizedRequestId,
        expiredAt: new Date(user.deleteOtpExpiresAt).toISOString(),
      });
      await trx.rollback();
      return res.status(410).json({ message: 'OTP expired. Please request deletion again.' });
    }

    const providedHash = hashOtp(normalizedOtp);
    if (providedHash !== user.deleteOtpHash) {
      logger.info('delete.confirm.bad_otp', { userId, requestId: normalizedRequestId });
      await trx.rollback();
      return res.status(400).json({ message: 'Invalid requestId or otp' });
    }

    originalEmail = user.email;
    originalName = user.fullName || user.username || 'there';
    deleteReason = user.deleteReason || null;

    const deletionResult = await performUserDeletion({
      user,
      reason: deleteReason,
      trx,
      requestId: normalizedRequestId,
      trigger: 'self_confirm',
    });
    sanitizedAt = deletionResult.sanitizedAt;
    deleteReason = deletionResult.normalizedReason;

    await trx.commit();
    committed = true;
  } catch (err) {
    if (!committed) {
      try {
        await trx.rollback();
      } catch (rollbackErr) {
        logger.error('delete.confirm.rollback_failed', { userId, error: String(rollbackErr) });
      }
    }
    logger.error('delete.confirm.error', { userId, requestId: normalizedRequestId, error: String(err) });
    return res.status(500).json({ message: 'Failed to confirm account deletion' });
  }

  let mailerError = null;
  try {
    await sendDeletionCompletedEmail({
      to: originalEmail,
      name: originalName,
      confirmedAt: sanitizedAt,
      reason: deleteReason,
    });
  } catch (err) {
    mailerError = err;
    logger.error('delete.confirm.mailer_error', { userId, requestId: normalizedRequestId, error: String(err) });
  }

  logger.info('delete.confirm.completed', { userId, requestId: normalizedRequestId, mailerError: Boolean(mailerError) });

  const responseBody = { status: 'deleted', confirmedAt: sanitizedAt.toISOString() };
  if (mailerError) responseBody.mailerError = true;

  return res.status(200).json(responseBody);
}

export async function adminDeleteUser(req, res) {
  const adminId = req.user?.id ?? null;
  const rawUserId = req.params?.id;
  const userId = Number(rawUserId);
  if (!Number.isInteger(userId) || userId <= 0) {
    logger.info('delete.admin.validation_failed', { adminId, rawUserId });
    return res.status(400).json({ message: 'invalid user id' });
  }

  const reason = normalizeReason(req.body?.reason);
  const trx = await sequelize.transaction();
  let committed = false;
  let sanitizedAt = null;
  let originalEmail = null;
  let originalName = null;

  try {
    const user = await User.findByPk(userId, { transaction: trx, lock: trx.LOCK.UPDATE });
    if (!user) {
      logger.info('delete.admin.user_not_found', { adminId, userId });
      await trx.rollback();
      return res.status(404).json({ message: 'user not found' });
    }
    if (user.accountStatus === 'deleted') {
      logger.info('delete.admin.already_deleted', { adminId, userId });
      await trx.rollback();
      return res.status(410).json({ message: 'account already deleted' });
    }

    originalEmail = user.email;
    originalName = user.fullName || user.username || 'there';
    const deletionResult = await performUserDeletion({
      user,
      reason: reason ?? user.deleteReason ?? `Deleted by admin:${adminId}`,
      trx,
      requestId: null,
      trigger: 'admin',
    });
    sanitizedAt = deletionResult.sanitizedAt;

    await trx.commit();
    committed = true;
    logger.info('delete.admin.success', {
      adminId,
      userId,
      reason: deletionResult.normalizedReason,
      confirmedAt: sanitizedAt.toISOString(),
    });
  } catch (err) {
    if (!committed) {
      try {
        await trx.rollback();
      } catch (rollbackErr) {
        logger.error('delete.admin.rollback_failed', { adminId, userId, error: String(rollbackErr) });
      }
    }
    logger.error('delete.admin.error', { adminId, userId, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to delete user' });
  }

  let mailerError = null;
  try {
    await sendDeletionCompletedEmail({
      to: originalEmail,
      name: originalName,
      confirmedAt: sanitizedAt,
      reason: reason ?? null,
    });
  } catch (err) {
    mailerError = err;
    logger.error('delete.admin.mailer_error', { adminId, userId, error: String(err) });
  }

  const responseBody = { status: 'deleted', userId, confirmedAt: sanitizedAt.toISOString() };
  if (mailerError) responseBody.mailerError = true;
  return res.status(200).json(responseBody);
}


