const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs-extra');
const os = require('os');
const nodePath = require('path');
const configFile = require('../src/configFile');

const validConfig = () => ({
  api: { port: 8000 },
  radio: { audio_directory: './audio', video_directory: './video' },
  interlude: { enabled: 'false' }
});

test('gets values by dot key, including false-y ones', () => {
  const config = { a: { b: 0, c: false, d: '' } };
  assert.strictEqual(configFile.getValue(config, 'a.b'), 0);
  assert.strictEqual(configFile.getValue(config, 'a.c'), false);
  assert.strictEqual(configFile.getValue(config, 'a.d'), '');
  assert.strictEqual(configFile.getValue(config, 'a.missing'), undefined);
  assert.strictEqual(configFile.getValue(config, 'a.b.deeper'), undefined);
  assert.strictEqual(configFile.getValue(config, 'toString'), undefined);
});

test('sets values, creating sections', () => {
  const config = { a: 5 };
  configFile.setValue(config, 'a.b.c', true);
  assert.deepStrictEqual(config, { a: { b: { c: true } } });
});

test('refuses keys that reach the prototype', () => {
  ['__proto__.polluted', 'constructor.prototype.polluted', 'a..b', ''].forEach(key => {
    assert.throws(() => configFile.setValue({}, key, 1), /not a valid config key/, key);
  });
  assert.strictEqual({}.polluted, undefined);
});

test('findConfigProblem', () => {
  assert.strictEqual(configFile.findConfigProblem(validConfig()), undefined);
  assert.match(configFile.findConfigProblem([]), /JSON object/);
  const noApi = validConfig();
  delete noApi.api;
  assert.match(configFile.findConfigProblem(noApi), /"api"/);
  const noRadio = validConfig();
  noRadio.radio = 5;
  assert.match(configFile.findConfigProblem(noRadio), /"radio"/);
  const interlude = validConfig();
  interlude.interlude = { enabled: true };
  assert.match(configFile.findConfigProblem(interlude), /"interlude"/);
});

test('writes and reads config.json', async () => {
  const directory = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'lsr-test-'));
  const configPath = nodePath.join(directory, 'config.json');
  await fs.writeJson(configPath, { old: true });
  await configFile.writeConfig(configPath, validConfig());
  assert.deepStrictEqual(await configFile.readConfig(configPath), validConfig());
  assert.deepStrictEqual(await fs.readdir(directory), ['config.json']);
  await fs.remove(directory);
});
