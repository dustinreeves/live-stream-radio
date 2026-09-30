const test = require('node:test');
const assert = require('node:assert');
const queue = require('../src/queue.service');

test('plays in order, with play next going first', () => {
  queue.clear();
  queue.add('a.mp3');
  queue.add('b.mp3');
  queue.add('c.mp3', true);
  assert.deepStrictEqual(
    queue.getQueue().map(item => item.path),
    ['c.mp3', 'a.mp3', 'b.mp3']
  );
  assert.strictEqual(queue.take().path, 'c.mp3');
  assert.ok(queue.hasTracks());
});

test('removes by position, ignoring bad positions', () => {
  queue.clear();
  queue.add('a.mp3');
  assert.strictEqual(queue.remove(NaN), false);
  assert.strictEqual(queue.remove(1), false);
  assert.strictEqual(queue.remove(0), true);
  assert.strictEqual(queue.hasTracks(), false);
});

test('refuses more than 200 tracks', () => {
  queue.clear();
  for (let i = 0; i < 200; i++) {
    assert.strictEqual(queue.add(`${i}.mp3`), true);
  }
  assert.strictEqual(queue.add('one-too-many.mp3'), false);
  queue.clear();
});
