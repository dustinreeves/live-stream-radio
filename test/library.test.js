const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs-extra');
const os = require('os');
const upath = require('upath');
const libraryService = require('../src/library.service');
const getRandomFile = require('../src/stream/randomFile');
const { mapWithLimit } = require('../src/api/library');
const { supportedAudioTypes } = require('../src/supportedFileTypes');

const makeFolder = async files => {
  const directory = await fs.mkdtemp(upath.join(os.tmpdir(), 'lsr-test-'));
  for (const file of files) {
    await fs.outputFile(upath.join(directory, file), '');
  }
  return directory;
};

test('lists audio in any case, including subfolders, sorted', async () => {
  const directory = await makeFolder(['b.MP3', 'a.flac', 'sub/c.m4a', 'notes.txt']);
  libraryService.clearCache();
  const files = libraryService.listFiles(supportedAudioTypes, directory).map(file => upath.relative(directory, file));
  assert.deepStrictEqual(files, ['a.flac', 'b.MP3', 'sub/c.m4a']);
  await fs.remove(directory);
});

test('caches listings until cleared', async () => {
  const directory = await makeFolder(['a.mp3']);
  libraryService.clearCache();
  assert.strictEqual(libraryService.listFiles(supportedAudioTypes, directory).length, 1);
  await fs.outputFile(upath.join(directory, 'b.mp3'), '');
  assert.strictEqual(libraryService.listFiles(supportedAudioTypes, directory).length, 1);
  libraryService.clearCache();
  assert.strictEqual(libraryService.listFiles(supportedAudioTypes, directory).length, 2);
  await fs.remove(directory);
});

test('clear errors for missing and empty folders', async () => {
  const directory = await makeFolder([]);
  libraryService.clearCache();
  await assert.rejects(getRandomFile(supportedAudioTypes, directory), /No supported files found/);
  await assert.rejects(getRandomFile(supportedAudioTypes, upath.join(directory, 'missing')), /does not exist/);
  await fs.remove(directory);
});

test('mapWithLimit keeps order and limits concurrency', async () => {
  let running = 0;
  let maxRunning = 0;
  const results = await mapWithLimit([1, 2, 3, 4, 5, 6], 2, async n => {
    running++;
    maxRunning = Math.max(maxRunning, running);
    await new Promise(resolve => setTimeout(resolve, 5));
    running--;
    return n * 10;
  });
  assert.deepStrictEqual(results, [10, 20, 30, 40, 50, 60]);
  assert.strictEqual(maxRunning, 2);
});
