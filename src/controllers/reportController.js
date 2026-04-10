import { Op } from 'sequelize';
import { Post, Report, Role, User } from '../models/index.js';
import {
  REPORT_REASON_CODES,
  REPORT_RESOLUTION_ACTIONS,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
} from '../models/Report.js';
import { logger } from '../utils/logger.js';

const MAX_REPORT_REASON_TEXT_LENGTH = 500;
const MAX_RESOLUTION_NOTE_LENGTH = 1000;
const MAX_REPORTS_PER_MINUTE = 10;
const ACTIVE_REPORT_STATUSES = new Set(['open', 'under_review']);
const ADMIN_ROLE_KEYS = new Set([0, 1]);

function normalizeText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function parsePositiveInt(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function toPlainReport(reportInstance) {
  const plain = typeof reportInstance?.toJSON === 'function' ? reportInstance.toJSON() : { ...reportInstance };
  if (plain?.reporter) {
    plain.reporter = {
      id: plain.reporter.id,
      fullName: plain.reporter.fullName,
      username: plain.reporter.username,
      avatarUrl: plain.reporter.avatarUrl ?? null,
      avatarUrlFull: plain.reporter.avatarUrlFull ?? null,
    };
  }
  if (plain?.assignee) {
    plain.assignee = {
      id: plain.assignee.id,
      fullName: plain.assignee.fullName,
      username: plain.assignee.username,
      avatarUrl: plain.assignee.avatarUrl ?? null,
      avatarUrlFull: plain.assignee.avatarUrlFull ?? null,
    };
  }
  return plain;
}

async function attachTargetPreview(reports) {
  const postIds = Array.from(
    new Set(
      reports
        .filter((report) => report.targetType === 'post')
        .map((report) => parsePositiveInt(report.targetId))
        .filter(Boolean)
    )
  );
  if (!postIds.length) return reports;

  const posts = await Post.findAll({
    where: { id: { [Op.in]: postIds } },
    attributes: ['id', 'content', 'userId', 'isArchived', 'createdAt'],
  });
  const byId = new Map(
    posts
      .map((post) => (typeof post.toJSON === 'function' ? post.toJSON() : post))
      .map((plain) => [plain?.id, plain])
      .filter(([id]) => Number.isInteger(Number(id)))
  );
  return reports.map((report) => {
    if (report.targetType !== 'post') return report;
    const target = byId.get(report.targetId) || null;
    return {
      ...report,
      target,
    };
  });
}

function validateStatusInput(rawStatus) {
  if (rawStatus === undefined || rawStatus === null || rawStatus === '') return null;
  const status = String(rawStatus).trim();
  if (!REPORT_STATUSES.includes(status)) return '__invalid__';
  return status;
}

function validateReasonCode(rawReasonCode) {
  const reasonCode = typeof rawReasonCode === 'string' ? rawReasonCode.trim() : '';
  if (!reasonCode) return null;
  if (!REPORT_REASON_CODES.includes(reasonCode)) return '__invalid__';
  return reasonCode;
}

function validateTargetType(rawTargetType) {
  const targetType = typeof rawTargetType === 'string' ? rawTargetType.trim() : '';
  if (!targetType) return null;
  if (!REPORT_TARGET_TYPES.includes(targetType)) return '__invalid__';
  return targetType;
}

export async function createReport(req, res) {
  try {
    const targetType = validateTargetType(req.body?.targetType);
    const targetId = parsePositiveInt(req.body?.targetId);
    const reasonCode = validateReasonCode(req.body?.reasonCode);
    const reasonText = normalizeText(req.body?.reasonText, MAX_REPORT_REASON_TEXT_LENGTH);

    if (!targetType) return res.status(400).json({ message: 'targetType is required' });
    if (targetType === '__invalid__') return res.status(400).json({ message: 'invalid targetType' });
    if (!targetId) return res.status(400).json({ message: 'targetId must be a positive integer' });
    if (!reasonCode) return res.status(400).json({ message: 'reasonCode is required' });
    if (reasonCode === '__invalid__') return res.status(400).json({ message: 'invalid reasonCode' });
    if (req.body?.reasonText !== undefined && !reasonText && String(req.body.reasonText).trim().length > 0) {
      return res.status(400).json({ message: `reasonText must be at most ${MAX_REPORT_REASON_TEXT_LENGTH} characters` });
    }

    const windowStart = new Date(Date.now() - 60_000);
    const recentReports = await Report.count({
      where: {
        reporterUserId: req.user.id,
        createdAt: { [Op.gt]: windowStart },
      },
    });
    if (recentReports >= MAX_REPORTS_PER_MINUTE) {
      return res.status(429).json({ message: 'Too many reports, try again in a minute' });
    }

    if (targetType === 'post') {
      const targetPost = await Post.findOne({ where: { id: targetId, isArchived: false }, attributes: ['id'] });
      if (!targetPost) return res.status(404).json({ message: 'target post not found' });
    }

    const existing = await Report.findOne({
      where: {
        reporterUserId: req.user.id,
        targetType,
        targetId,
        status: { [Op.in]: Array.from(ACTIVE_REPORT_STATUSES) },
      },
      order: [['createdAt', 'DESC']],
    });
    if (existing) {
      return res.status(409).json({ message: 'active report already exists for this target' });
    }

    const report = await Report.create({
      reporterUserId: req.user.id,
      targetType,
      targetId,
      reasonCode,
      reasonText,
      status: 'open',
      priority: 'normal',
      metadata: {},
    });

    logger.info('report.create.success', {
      reporterUserId: req.user.id,
      reportId: report.id,
      targetType,
      targetId,
      reasonCode,
    });

    return res.status(201).json(toPlainReport(report));
  } catch (err) {
    logger.error('report.create.error', { userId: req.user.id, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to submit report' });
  }
}

export async function listMyReports(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const offset = (page - 1) * limit;
    const status = validateStatusInput(req.query.status);
    if (status === '__invalid__') {
      return res.status(400).json({ message: 'invalid status filter' });
    }

    const where = { reporterUserId: req.user.id };
    if (status) where.status = status;

    const { rows, count } = await Report.findAndCountAll({
      where,
      include: [{ model: User, as: 'assignee', attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] }],
      order: [['createdAt', 'DESC']],
      offset,
      limit,
    });

    const serialized = await attachTargetPreview(rows.map(toPlainReport));
    const hasMore = offset + serialized.length < count;
    return res.json({
      page,
      limit,
      count: serialized.length,
      total: count,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
      prevPage: page > 1 ? page - 1 : null,
      reports: serialized,
    });
  } catch (err) {
    logger.error('report.list_my.error', { userId: req.user.id, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to load reports' });
  }
}

export async function adminListReports(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const offset = (page - 1) * limit;

    const status = validateStatusInput(req.query.status);
    if (status === '__invalid__') return res.status(400).json({ message: 'invalid status filter' });

    const reasonCode = validateReasonCode(req.query.reasonCode);
    if (reasonCode === '__invalid__') return res.status(400).json({ message: 'invalid reasonCode filter' });

    const targetType = validateTargetType(req.query.targetType);
    if (targetType === '__invalid__') return res.status(400).json({ message: 'invalid targetType filter' });

    const where = {};
    if (status) where.status = status;
    if (reasonCode) where.reasonCode = reasonCode;
    if (targetType) where.targetType = targetType;

    const { rows, count } = await Report.findAndCountAll({
      where,
      include: [
        { model: User, as: 'reporter', attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] },
        { model: User, as: 'assignee', attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] },
      ],
      order: [
        ['status', 'ASC'],
        ['createdAt', 'DESC'],
      ],
      offset,
      limit,
    });

    const serialized = await attachTargetPreview(rows.map(toPlainReport));
    const hasMore = offset + serialized.length < count;
    return res.json({
      page,
      limit,
      count: serialized.length,
      total: count,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
      prevPage: page > 1 ? page - 1 : null,
      reports: serialized,
    });
  } catch (err) {
    logger.error('report.admin_list.error', { adminId: req.user.id, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to load reports' });
  }
}

export async function adminGetReport(req, res) {
  try {
    const reportId = parsePositiveInt(req.params.id);
    if (!reportId) return res.status(400).json({ message: 'invalid report id' });

    const report = await Report.findByPk(reportId, {
      include: [
        { model: User, as: 'reporter', attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] },
        { model: User, as: 'assignee', attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] },
      ],
    });
    if (!report) return res.status(404).json({ message: 'report not found' });

    const [withTarget] = await attachTargetPreview([toPlainReport(report)]);
    return res.json(withTarget);
  } catch (err) {
    logger.error('report.admin_get.error', { adminId: req.user.id, reportId: req.params.id, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to load report' });
  }
}

export async function adminAssignReport(req, res) {
  try {
    const reportId = parsePositiveInt(req.params.id);
    const assigneeUserId = parsePositiveInt(req.body?.assigneeUserId);
    if (!reportId) return res.status(400).json({ message: 'invalid report id' });
    if (!assigneeUserId) return res.status(400).json({ message: 'assigneeUserId must be a positive integer' });

    const [report, assignee] = await Promise.all([
      Report.findByPk(reportId),
      User.findByPk(assigneeUserId, {
        attributes: ['id', 'accountStatus', 'loginDisabled'],
        include: [{ model: Role, attributes: ['roleKey'] }],
      }),
    ]);
    if (!report) return res.status(404).json({ message: 'report not found' });
    if (!assignee || assignee.accountStatus === 'deleted' || assignee.loginDisabled) {
      return res.status(404).json({ message: 'assignee user not found' });
    }
    const assigneeRoleKey = Number(assignee.Role?.roleKey);
    if (!Number.isFinite(assigneeRoleKey) || !ADMIN_ROLE_KEYS.has(assigneeRoleKey)) {
      return res.status(400).json({ message: 'assignee must be an admin or super-admin' });
    }

    report.assigneeUserId = assigneeUserId;
    if (report.status === 'open') report.status = 'under_review';
    await report.save();

    const hydrated = await Report.findByPk(report.id, {
      include: [
        { model: User, as: 'reporter', attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] },
        { model: User, as: 'assignee', attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] },
      ],
    });

    logger.info('report.assign.success', { adminId: req.user.id, reportId: report.id, assigneeUserId });
    return res.json(toPlainReport(hydrated || report));
  } catch (err) {
    logger.error('report.assign.error', { adminId: req.user.id, reportId: req.params.id, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to assign report' });
  }
}

export async function adminUpdateReportStatus(req, res) {
  try {
    const reportId = parsePositiveInt(req.params.id);
    const status = validateStatusInput(req.body?.status);
    const resolutionAction = req.body?.resolutionAction === undefined || req.body?.resolutionAction === null || req.body?.resolutionAction === ''
      ? null
      : String(req.body.resolutionAction).trim();
    const resolutionNote = normalizeText(req.body?.resolutionNote, MAX_RESOLUTION_NOTE_LENGTH);

    if (!reportId) return res.status(400).json({ message: 'invalid report id' });
    if (!status) return res.status(400).json({ message: 'status is required' });
    if (status === '__invalid__') return res.status(400).json({ message: 'invalid status' });
    if (resolutionAction && !REPORT_RESOLUTION_ACTIONS.includes(resolutionAction)) {
      return res.status(400).json({ message: 'invalid resolutionAction' });
    }
    if (req.body?.resolutionNote !== undefined && !resolutionNote && String(req.body.resolutionNote).trim().length > 0) {
      return res.status(400).json({ message: `resolutionNote must be at most ${MAX_RESOLUTION_NOTE_LENGTH} characters` });
    }

    const report = await Report.findByPk(reportId);
    if (!report) return res.status(404).json({ message: 'report not found' });

    if (resolutionAction === 'archive_post') {
      if (report.targetType !== 'post') {
        return res.status(400).json({ message: 'archive_post is only supported for post reports' });
      }
      const targetPost = await Post.findByPk(report.targetId);
      if (!targetPost) return res.status(404).json({ message: 'target post not found' });
      if (!targetPost.isArchived) {
        targetPost.isArchived = true;
        targetPost.archivedAt = new Date();
        targetPost.archivedBy = `user:${req.user.id}`;
        targetPost.archiveReason = normalizeText(req.body?.archiveReason, 255) || 'Archived during report resolution';
        await targetPost.save();
      }
    }

    report.status = status;
    report.assigneeUserId = report.assigneeUserId || req.user.id;
    if (status === 'resolved' || status === 'dismissed') {
      report.resolvedAt = new Date();
      report.resolvedBy = req.user.id;
      report.resolutionAction = resolutionAction || 'none';
      report.resolutionNote = resolutionNote;
    } else {
      report.resolvedAt = null;
      report.resolvedBy = null;
      report.resolutionAction = 'none';
      report.resolutionNote = null;
    }

    await report.save();

    const hydrated = await Report.findByPk(report.id, {
      include: [
        { model: User, as: 'reporter', attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] },
        { model: User, as: 'assignee', attributes: ['id', 'fullName', 'username', 'avatarUrl', 'avatarUrlFull'] },
      ],
    });
    const [withTarget] = await attachTargetPreview([toPlainReport(hydrated || report)]);

    logger.info('report.update_status.success', {
      adminId: req.user.id,
      reportId: report.id,
      status,
      resolutionAction: report.resolutionAction,
    });
    return res.json(withTarget);
  } catch (err) {
    logger.error('report.update_status.error', { adminId: req.user.id, reportId: req.params.id, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: 'Failed to update report status' });
  }
}
