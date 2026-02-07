import Notification from '../models/Notification.js';
import { markNotificationRead, markAllNotificationsRead } from '../utils/notifications.js';

const MAX_LIMIT = 100;

export const listNotifications = async (req, res) => {
  const page = Math.max(parseInt(req.query.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), MAX_LIMIT);
  const offset = (page - 1) * limit;

  const { count, rows } = await Notification.findAndCountAll({
    where: { userId: req.user.id },
    offset,
    limit,
    order: [
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
  });

  const items = rows.map((n) => ({
    id: n.id,
    type: n.type,
    entityType: n.entityType,
    entityId: n.entityId,
    metadata: n.metadata || {},
    status: n.status,
    userId: n.userId,
    actorId: n.actorId,
    createdAt: n.createdAt,
    readAt: n.readAt,
  }));
  const hasMore = offset + items.length < count;
  return res.json({
    page,
    limit,
    count: items.length,
    total: count,
    hasMore,
    nextPage: hasMore ? page + 1 : null,
    notifications: items,
  });
};

export const markAsRead = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'invalid notification id' });
  const updated = await markNotificationRead({ userId: req.user.id, notificationId: id });
  if (!updated) return res.status(404).json({ message: 'notification not found' });
  return res.json({ ok: true, notification: { id: updated.id, status: updated.status, readAt: updated.readAt } });
};

export const markAllAsRead = async (req, res) => {
  const affected = await markAllNotificationsRead({ userId: req.user.id });
  return res.json({ ok: true, updated: affected });
};
