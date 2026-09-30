const test = require('node:test');
const assert = require('node:assert');

const freshHistory = () => {
  delete require.cache[require.resolve('../src/history.service')];
  return require('../src/history.service');
};

test('keeps the newest items once full', () => {
  const history = freshHistory();
  history.setNumberOfHistoryItems(3);
  for (let i = 0; i < 5; i++) {
    history.addItemToHistory({ n: i });
  }
  assert.deepStrictEqual(
    history.getHistory().map(item => item.n),
    [2, 3, 4]
  );
});

test('defaults to 100 items, also for bad values', () => {
  const history = freshHistory();
  history.setNumberOfHistoryItems('not a number');
  for (let i = 0; i < 101; i++) {
    history.addItemToHistory({ n: i });
  }
  assert.strictEqual(history.getHistory().length, 100);
  assert.strictEqual(history.getHistory()[99].n, 100);
});

test('adds the date', () => {
  const history = freshHistory();
  history.addItemToHistory({ n: 1 });
  assert.ok(history.getHistory()[0].date > 0);
});
