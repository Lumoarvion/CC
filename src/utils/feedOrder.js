// Order posts placing unseen items first while preserving original order within groups.
export function orderBySeenFlag(posts) {
  const unseen = [];
  const seen = [];
  for (const post of posts) {
    if (post && post.viewerHasSeen) {
      seen.push(post);
    } else {
      unseen.push(post);
    }
  }
  return [...unseen, ...seen];
}
