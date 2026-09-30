const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const { startFfmpeg, runFfmpeg, parseTime } = require('../src/stream/ffmpegProcess');

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

test('parseTime', () => {
  assert.strictEqual(parseTime('00:01:02.500000'), 62.5);
  assert.strictEqual(parseTime('01:00:00.000000'), 3600);
  assert.strictEqual(parseTime('N/A'), undefined);
});

test('reports progress and the end', { skip: !hasFfmpeg && 'ffmpeg is not installed' }, async () => {
  const events = { started: false, progress: [] };
  await new Promise((resolve, reject) => {
    startFfmpeg(undefined, ['-f', 'lavfi', '-i', 'sine=d=2', '-f', 'null', '-'], {
      start: commandLine => {
        events.started = commandLine.indexOf('sine=d=2') !== -1;
      },
      progress: progress => events.progress.push(progress.seconds),
      end: resolve,
      error: reject
    });
  });
  assert.ok(events.started);
  assert.ok(events.progress.length > 0);
  assert.ok(events.progress[events.progress.length - 1] >= 1.9);
});

test('kill stops ffmpeg, reporting it as an error', { skip: !hasFfmpeg && 'ffmpeg is not installed' }, async () => {
  let error;
  const ffmpegProcess = startFfmpeg(undefined, ['-re', '-f', 'lavfi', '-i', 'sine', '-f', 'null', '-'], {
    error: err => {
      error = err;
    }
  });
  await new Promise(resolve => setTimeout(resolve, 300));
  await ffmpegProcess.kill();
  assert.notStrictEqual(ffmpegProcess.process.exitCode === 0, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.match(error.message, /ffmpeg/);
});

test('runFfmpeg rejects with the error output', { skip: !hasFfmpeg && 'ffmpeg is not installed' }, async () => {
  await assert.rejects(runFfmpeg(undefined, ['-i', 'does-not-exist.mp4', '-f', 'null', '-']), /exited with code/);
});

test('a missing ffmpeg is an error, not a crash', async () => {
  await assert.rejects(runFfmpeg('definitely-not-ffmpeg-here', ['-version']), /Could not run/);
});
