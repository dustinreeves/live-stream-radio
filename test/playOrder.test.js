const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs-extra');
const os = require('os');
const nodePath = require('path');

// A fresh copy of the service, as after a restart
const freshService = () => {
  delete require.cache[require.resolve('../src/playOrder.service')];
  return require('../src/playOrder.service');
};

const makeProject = async names => {
  const project = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'lsr-test-'));
  const folder = nodePath.join(project, 'audio');
  const files = names.map(name => nodePath.join(folder, name));
  for (const file of files) {
    await fs.outputFile(file, '');
  }
  return { project, folder, files };
};

test('shuffle plays everything once before repeating, many rounds', async () => {
  const playOrder = freshService();
  const { project, folder, files } = await makeProject(['a.mp3', 'b.mp3', 'c.mp3', 'd.mp3', 'e.mp3']);
  let previous;
  for (let round = 0; round < 20; round++) {
    const seen = new Set();
    for (let i = 0; i < files.length; i++) {
      const pick = playOrder.pickNext(project, folder, files, 'shuffle');
      assert.notStrictEqual(pick, previous, 'never the same file twice in a row');
      seen.add(pick);
      previous = pick;
    }
    assert.strictEqual(seen.size, files.length, `round ${round} played every file`);
  }
  await fs.remove(project);
});

test('shuffle is the default, also for unknown play orders', async () => {
  const playOrder = freshService();
  const { project, folder, files } = await makeProject(['a.mp3', 'b.mp3', 'c.mp3']);
  const seen = new Set([undefined, 'nonsense', undefined].map(order => playOrder.pickNext(project, folder, files, order)));
  assert.strictEqual(seen.size, 3);
  await fs.remove(project);
});

test('shuffle carries on after a restart', async () => {
  const { project, folder, files } = await makeProject(['a.mp3', 'b.mp3', 'c.mp3', 'd.mp3']);
  const first = freshService();
  const played = [first.pickNext(project, folder, files), first.pickNext(project, folder, files)];

  const afterRestart = freshService();
  const rest = [afterRestart.pickNext(project, folder, files), afterRestart.pickNext(project, folder, files)];
  assert.strictEqual(new Set(played.concat(rest)).size, 4);
  assert.ok(fs.existsSync(nodePath.join(project, afterRestart.STATE_FILE_NAME)));
  await fs.remove(project);
});

test('new files join the current round, removed ones are forgotten', async () => {
  const playOrder = freshService();
  const { project, folder, files } = await makeProject(['a.mp3', 'b.mp3']);
  const first = playOrder.pickNext(project, folder, files);
  const withNew = files.filter(file => file !== first).concat(nodePath.join(folder, 'new.mp3'));
  const next = [playOrder.pickNext(project, folder, withNew), playOrder.pickNext(project, folder, withNew)];
  assert.strictEqual(new Set(next).size, 2);
  assert.ok(next.indexOf(first) === -1);
  await fs.remove(project);
});

test('in order sorts numbers as numbers, and wraps around', async () => {
  const playOrder = freshService();
  const { project, folder, files } = await makeProject(['Episode 10.mp3', 'Episode 9.mp3', 'Episode 1.mp3', 'sub/Episode 11.mp3']);
  const names = [];
  for (let i = 0; i < 5; i++) {
    names.push(
      nodePath
        .relative(folder, playOrder.pickNext(project, folder, files, 'in_order'))
        .split(nodePath.sep)
        .join('/')
    );
  }
  assert.deepStrictEqual(names, ['Episode 1.mp3', 'Episode 9.mp3', 'Episode 10.mp3', 'sub/Episode 11.mp3', 'Episode 1.mp3']);
  await fs.remove(project);
});

test('in order continues after the last played file was removed', async () => {
  const playOrder = freshService();
  const { project, folder, files } = await makeProject(['ep1.mp3', 'ep2.mp3', 'ep3.mp3']);
  assert.strictEqual(playOrder.pickNext(project, folder, files, 'in_order'), files[0]);
  assert.strictEqual(playOrder.pickNext(project, folder, files, 'in_order'), files[1]);
  const withoutEp2 = [files[0], files[2]];
  assert.strictEqual(playOrder.pickNext(project, folder, withoutEp2, 'in_order'), files[2]);
  await fs.remove(project);
});

test('a requested file counts as played', async () => {
  const playOrder = freshService();
  const { project, folder, files } = await makeProject(['a.mp3', 'b.mp3', 'c.mp3']);
  playOrder.markPlayed(project, folder, files[1]);
  const picks = [playOrder.pickNext(project, folder, files), playOrder.pickNext(project, folder, files)];
  assert.ok(picks.indexOf(files[1]) === -1);
  playOrder.markPlayed(project, folder, nodePath.join(project, 'elsewhere', 'x.mp3'));
  await fs.remove(project);
});

test('an empty folder is an error', async () => {
  const playOrder = freshService();
  const { project, folder } = await makeProject([]);
  assert.throws(() => playOrder.pickNext(project, folder, []), /No supported files found/);
  await fs.remove(project);
});
