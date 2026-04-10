import { Op } from 'sequelize';
import { UserBlock } from '../models/index.js';

export async function isBlockedEitherWay(userAId, userBId) {
  const a = Number(userAId);
  const b = Number(userBId);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a <= 0 || b <= 0 || a === b) return false;
  const relation = await UserBlock.findOne({
    where: {
      [Op.or]: [
        { blockerUserId: a, blockedUserId: b },
        { blockerUserId: b, blockedUserId: a },
      ],
    },
    attributes: ['id'],
  });
  return Boolean(relation);
}

export async function listBlockedSets(viewerUserId) {
  const viewerId = Number(viewerUserId);
  if (!Number.isInteger(viewerId) || viewerId <= 0) {
    return { blockedByViewer: new Set(), blockedViewerBy: new Set(), excluded: new Set() };
  }
  const rows = await UserBlock.findAll({
    where: {
      [Op.or]: [{ blockerUserId: viewerId }, { blockedUserId: viewerId }],
    },
    attributes: ['blockerUserId', 'blockedUserId'],
  });

  const blockedByViewer = new Set();
  const blockedViewerBy = new Set();
  for (const row of rows) {
    const blockerUserId = Number(row.blockerUserId);
    const blockedUserId = Number(row.blockedUserId);
    if (blockerUserId === viewerId) blockedByViewer.add(blockedUserId);
    if (blockedUserId === viewerId) blockedViewerBy.add(blockerUserId);
  }
  const excluded = new Set([...blockedByViewer, ...blockedViewerBy]);
  return { blockedByViewer, blockedViewerBy, excluded };
}
