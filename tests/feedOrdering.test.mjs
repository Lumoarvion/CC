import assert from 'assert';
import { orderBySeenFlag } from '../src/utils/feedOrder.js';

function runOrderTest() {
  const posts = [
    { id: 1, viewerHasSeen: true },
    { id: 2, viewerHasSeen: false },
    { id: 3, viewerHasSeen: true },
    { id: 4, viewerHasSeen: false },
  ];
  const ordered = orderBySeenFlag(posts);
  assert.deepStrictEqual(
    ordered.map((p) => p.id),
    [2, 4, 1, 3],
    'Unseen posts should come first, preserving relative order'
  );
}

function runEmptyTest() {
  const ordered = orderBySeenFlag([]);
  assert.deepStrictEqual(ordered, [], 'Empty list should stay empty');
}

runOrderTest();
runEmptyTest();
console.log('feedOrdering tests passed');
