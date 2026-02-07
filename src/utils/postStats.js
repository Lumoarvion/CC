import PostStats from '../models/PostStats.js';

export function projectStats(statsInstance) {
  if (!statsInstance) {
    return {
      likeCount: 0,
      commentCount: 0,
      quoteCount: 0,
      viewCount: 0,
    };
  }
  const plain = typeof statsInstance.toJSON === 'function' ? statsInstance.toJSON() : { ...statsInstance };
  return {
    likeCount: Number(plain.likeCount) || 0,
    commentCount: Number(plain.commentCount) || 0,
    quoteCount: Number(plain.quoteCount) || 0,
    viewCount: Number(plain.viewCount) || 0,
  };
}

async function ensureStats(postId) {
  if (!Number.isInteger(postId)) {
    throw new Error('postId must be an integer');
  }
  const [stats] = await PostStats.findOrCreate({
    where: { postId },
    defaults: { postId },
  });
  return stats;
}

export async function adjustPostStats(postId, { likeDelta = 0, commentDelta = 0, quoteDelta = 0, viewDelta = 0 } = {}) {
  const filtered = {};
  if (likeDelta) filtered.likeCount = likeDelta;
  if (commentDelta) filtered.commentCount = commentDelta;
  if (quoteDelta) filtered.quoteCount = quoteDelta;
  if (viewDelta) filtered.viewCount = viewDelta;
  if (!Object.keys(filtered).length) {
    return ensureStats(postId);
  }
  await ensureStats(postId);
  await PostStats.increment(filtered, { where: { postId } });
  return PostStats.findOne({ where: { postId } });
}

export async function getPostStats(postId) {
  const stats = await PostStats.findOne({ where: { postId } });
  if (stats) return stats;
  return ensureStats(postId);
}
