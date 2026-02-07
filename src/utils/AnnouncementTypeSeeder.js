import AnnouncementType from '../models/AnnouncementType.js';

export async function ensureAnnouncementTypes({ oneTime = false } = {}) {
  const defaults = [
    { typeKey: 'general',     displayName: 'General Announcement',   description: 'General campus-wide announcements and updates.',        isActive: true, createdBy: 'system', updatedBy: 'system' },
    { typeKey: 'academic',    displayName: 'Academic Update',        description: 'Academic calendars, class schedules, and curriculum changes.', isActive: true, createdBy: 'system', updatedBy: 'system' },
    { typeKey: 'event',       displayName: 'Event',                  description: 'Events, workshops, and community gatherings.',         isActive: true, createdBy: 'system', updatedBy: 'system' },
    { typeKey: 'deadline',    displayName: 'Deadline Reminder',      description: 'Important academic or administrative deadlines.',      isActive: true, createdBy: 'system', updatedBy: 'system' },
    { typeKey: 'maintenance', displayName: 'Maintenance Notice',     description: 'Facility maintenance or planned service interruptions.', isActive: true, createdBy: 'system', updatedBy: 'system' },
    { typeKey: 'emergency',   displayName: 'Emergency Alert',        description: 'Urgent safety advisories requiring immediate attention.', isActive: true, createdBy: 'system', updatedBy: 'system' },
  ];

  if (oneTime) {
    const count = await AnnouncementType.count();
    if (count > 0) return;
    await AnnouncementType.bulkCreate(defaults);
    return;
  }

  const t = await AnnouncementType.sequelize.transaction();
  try {
    for (const entry of defaults) {
      await AnnouncementType.findOrCreate({
        where: { typeKey: entry.typeKey },
        defaults: entry,
        transaction: t,
      });
    }
    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }
}
