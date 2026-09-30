// Drives the real routes through fastify's inject, with a config.json in a temp folder
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs-extra');
const os = require('os');
const nodePath = require('path');

const usersService = require('../src/api/users');
const authService = require('../src/api/auth');

const API_KEY = 'test-key-0123456789';

const setUp = async (configChanges = {}) => {
  const directory = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'lsr-test-'));
  const config = Object.assign(
    {
      api: { key: API_KEY },
      radio: { audio_directory: './audio', video_directory: './video' },
      console: { users: [{ username: 'dj', password_hash: await usersService.hashPassword('correct horse battery') }] }
    },
    configChanges
  );
  const configPath = nodePath.join(directory, 'config.json');
  await fs.writeJson(configPath, config);
  await fs.outputFile(nodePath.join(directory, 'audio', 'song.mp3'), '');

  const getConfig = async () => fs.readJson(configPath);
  const stream = { isRunning: () => false };
  const fastify = require('fastify')();
  fastify.register(require('@fastify/formbody'));
  const path = `${directory}/`;
  require('../src/api/config')(fastify, path, stream, getConfig);
  require('../src/api/console')(fastify, path, stream, getConfig);
  require('../src/api/queue')(fastify, path, stream, getConfig);

  const inject = options => {
    return fastify.inject(Object.assign({ headers: { authorization: API_KEY } }, options)).then(response => {
      return { status: response.statusCode, body: JSON.parse(response.payload) };
    });
  };

  return { directory, configPath, fastify, inject };
};

test('routes need a key or a session', async () => {
  const { directory, inject } = await setUp();
  assert.strictEqual((await inject({ method: 'GET', url: '/config', headers: {} })).status, 401);
  assert.strictEqual((await inject({ method: 'GET', url: '/config', headers: { authorization: 'wrong' } })).status, 401);
  assert.strictEqual((await inject({ method: 'GET', url: '/config' })).status, 200);
  assert.strictEqual((await inject({ method: 'GET', url: `/config?api_key=${API_KEY}`, headers: {} })).status, 200);
  await fs.remove(directory);
});

test('console sign in, and lock out after 5 wrong passwords', async () => {
  const { directory, inject } = await setUp();
  const login = password => inject({ method: 'POST', url: '/console/login', headers: {}, payload: { username: 'dj', password: password } });

  const ok = await login('correct horse battery');
  assert.strictEqual(ok.status, 200);
  const session = { authorization: `Session ${ok.body.token}` };
  assert.strictEqual((await inject({ method: 'GET', url: '/config', headers: session })).status, 200);

  await inject({ method: 'POST', url: '/console/logout', headers: session });
  assert.strictEqual((await inject({ method: 'GET', url: '/config', headers: session })).status, 401);

  for (let i = 0; i < 5; i++) {
    assert.strictEqual((await login('wrong')).status, 401);
  }
  assert.strictEqual((await login('correct horse battery')).status, 429);
  await fs.remove(directory);
});

test('GET /config?key= returns false-y values', async () => {
  const { directory, inject } = await setUp({ video_fps: 0, normalize_audio: false });
  assert.deepStrictEqual((await inject({ method: 'GET', url: '/config?key=normalize_audio' })).body, {
    key: 'normalize_audio',
    value: false
  });
  assert.strictEqual((await inject({ method: 'GET', url: '/config?key=video_fps' })).body.value, 0);
  assert.strictEqual((await inject({ method: 'GET', url: '/config?key=missing' })).status, 404);
  assert.strictEqual((await inject({ method: 'GET', url: '/config?key=__proto__' })).status, 400);
  await fs.remove(directory);
});

test('POST /config changes a value, and refuses bad ones', async () => {
  const { directory, configPath, inject } = await setUp();
  const post = payload => inject({ method: 'POST', url: '/config', payload: payload });

  assert.strictEqual((await post({ key: 'video_fps', value: '"25"' })).status, 200);
  assert.strictEqual((await post({ key: 'interlude.frequency', value: 0.5 })).status, 200);
  assert.strictEqual((await post({ key: 'video_fps', value: 'not json' })).status, 400);
  assert.strictEqual((await post({ key: '__proto__.polluted', value: 'true' })).status, 400);
  assert.strictEqual((await post({ key: 'radio', value: '5' })).status, 400);
  assert.strictEqual((await post({ value: '5' })).status, 400);

  const config = await fs.readJson(configPath);
  assert.strictEqual(config.video_fps, '25');
  assert.strictEqual(config.interlude.frequency, 0.5);
  assert.strictEqual(config.radio.audio_directory, './audio');
  assert.strictEqual({}.polluted, undefined);
  await fs.remove(directory);
});

test('PUT /config replaces the config, keeping a backup', async () => {
  const { directory, configPath, inject } = await setUp();
  const original = await fs.readJson(configPath);

  const broken = Object.assign({}, original, { radio: {} });
  assert.strictEqual((await inject({ method: 'PUT', url: '/config', payload: { config: broken } })).status, 400);

  const changed = Object.assign({}, original, { video_fps: '30' });
  assert.strictEqual((await inject({ method: 'PUT', url: '/config', payload: { config: changed } })).status, 200);
  assert.strictEqual((await fs.readJson(configPath)).video_fps, '30');
  assert.deepStrictEqual(await fs.readJson(`${configPath}.bak`), original);
  await fs.remove(directory);
});

test('only library tracks can be queued', async () => {
  const { directory, inject } = await setUp();
  const queued = await inject({ method: 'POST', url: '/stream/queue', payload: { path: '/etc/passwd' } });
  assert.strictEqual(queued.status, 400);

  const library = require('../src/api/library');
  const songPath = (await library.getAllAudio(`${directory}/`, async () => fs.readJson(nodePath.join(directory, 'config.json'))))[0];
  const ok = await inject({ method: 'POST', url: '/stream/queue', payload: { path: songPath } });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.queue[ok.body.queue.length - 1].path, songPath);
  await inject({ method: 'POST', url: '/stream/queue/clear' });
  await fs.remove(directory);
});

test('the example api key is recognised', () => {
  assert.strictEqual(authService.usesDefaultApiKey({ api: { key: 'super-secret-api-key' } }), true);
  assert.strictEqual(authService.usesDefaultApiKey({ api: { key: API_KEY } }), false);
});
