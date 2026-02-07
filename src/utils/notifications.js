import Notification from '../models/Notification.js';
import { logger } from './logger.js';

/**
 * Create a notification if actor and recipient differ.
 */
export async function createNotification({ userId, actorId, type, entityType, entityId, metadata = {}, transaction = null }) {
  if (!userId || !actorId || userId === actorId) {
    return null;
  }
  try {
    const record = await Notification.create(
      {
        userId,
        actorId,
        type,
        entityType,
        entityId,
        metadata,
        status: 'unread',
      },
      transaction ? { transaction } : {}
    );
    return record;
  } catch (err) {
    logger.error('notification.create.failed', {
      userId,
      actorId,
      type,
      entityType,
      entityId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function markNotificationRead({ userId, notificationId }) {
  const notification = await Notification.findOne({ where: { id: notificationId, userId } });
  if (!notification) return null;
  if (notification.status === 'read') return notification;
  notification.status = 'read';
  notification.readAt = new Date();
  await notification.save();
  return notification;
}

export async function markAllNotificationsRead({ userId }) {
  const [count] = await Notification.update(
    { status: 'read', readAt: new Date() },
    { where: { userId, status: 'unread' } }
  );
  return count;
}
