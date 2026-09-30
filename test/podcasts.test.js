const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs-extra');
const os = require('os');
const nodePath = require('path');

const feedReader = require('../src/podcasts/feed');

// A local podcast host: /feed.xml lists the episodes, /<name>.mp3 serves each one
const startServer = () => {
  const server = { episodes: [], downloads: [] };
  server.http = http.createServer((request, response) => {
    if (request.url === '/feed.xml') {
      response.setHeader('Content-Type', 'application/rss+xml');
      response.end(
        `<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>` +
          `<title>Test &amp; Show</title>` +
          server.episodes
            .map(
              episode =>
                `<item><title><![CDATA[${episode.title}]]></title><guid isPermaLink="false">${episode.guid}</guid>` +
                `<pubDate>${episode.date}</pubDate>` +
                `<enclosure url="${server.url}/${episode.guid}.mp3" type="audio/mpeg" length="5"/></item>`
            )
            .join('') +
          `</channel></rss>`
      );
      return;
    }
    const match = request.url.match(/^\/(.+)\.mp3$/);
    if (match) {
      server.downloads.push(match[1]);
      response.setHeader('Content-Type', 'audio/mpeg');
      response.end(`audio ${match[1]}`);
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  return new Promise(resolve => {
    server.http.listen(0, '127.0.0.1', () => {
      server.url = `http://127.0.0.1:${server.http.address().port}`;
      resolve(server);
    });
  });
};

const freshService = () => {
  delete require.cache[require.resolve('../src/podcasts/podcasts.service')];
  return require('../src/podcasts/podcasts.service');
};

const makeProject = async config => {
  const project = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'lsr-test-'));
  await fs.ensureDir(nodePath.join(project, 'audio'));
  const configPath = nodePath.join(project, 'config.json');
  await fs.writeJson(configPath, config);
  return { project: `${project}${nodePath.sep}`, configPath, getConfig: async () => fs.readJson(configPath) };
};

const episode = (guid, title, day) => ({ guid: guid, title: title, date: new Date(Date.UTC(2026, 8, day)).toUTCString() });

test('parseFeed reads episodes newest first, skipping ones that are not audio', () => {
  const feed = feedReader.parseFeed(`<rss><channel><title>Show</title>
    <item><title>Old</title><pubDate>Mon, 01 Jun 2026 10:00:00 GMT</pubDate><enclosure url="https://x.test/old.mp3" type="audio/mpeg"/></item>
    <item><title>Video</title><pubDate>Mon, 15 Jun 2026 10:00:00 GMT</pubDate><enclosure url="https://x.test/v.mp4" type="video/mp4"/></item>
    <item><title>New</title><guid>g-new</guid><pubDate>Tue, 30 Jun 2026 10:00:00 GMT</pubDate><enclosure url="https://x.test/new?id=1" type="audio/x-m4a"/></item>
  </channel></rss>`);
  assert.strictEqual(feed.title, 'Show');
  assert.strictEqual(feed.skipped, 1);
  assert.deepStrictEqual(
    feed.episodes.map(e => [e.title, e.guid, e.extension]),
    [
      ['New', 'g-new', '.m4a'],
      ['Old', 'https://x.test/old.mp3', '.mp3']
    ]
  );
});

test('parseFeed refuses things that are not RSS', () => {
  assert.throws(() => feedReader.parseFeed('<html><body>hi</body></html>'), /isn't an RSS podcast feed/);
});

test('episode file names are safe on every OS, and start with the date', () => {
  const service = freshService();
  // No path separators, so a title can't reach outside the show's folder
  const name = service.getEpisodeFileName({ title: '../../etc/passwd: "a" <b>?', date: '2026-09-30T10:00:00.000Z', extension: '.mp3' });
  assert.strictEqual(name, '2026-09-30 .. .. etc passwd a b.mp3');
  assert.strictEqual(nodePath.basename(name), name);
  assert.strictEqual(nodePath.win32.basename(name), name);
  assert.strictEqual(service.safeFileName('CON'), 'CON_');
  assert.strictEqual(service.safeFileName('...'), 'podcast');
  assert.strictEqual(service.getDefaultDirectory({ radio: { audio_directory: './audio/' } }, 'My: Show'), './audio/My Show');
});

test('downloads the newest episodes, then keeps only the newest', async () => {
  const server = await startServer();
  server.episodes = [episode('e3', 'Third', 3), episode('e2', 'Second', 2), episode('e1', 'First', 1)];
  const { project, configPath, getConfig } = await makeProject({
    api: {},
    radio: { audio_directory: './audio', video_directory: './video' },
    podcasts: { feeds: [{ url: `${server.url}/feed.xml`, keep_latest: 2 }] }
  });
  let playing;
  const service = freshService();
  service.start(project, getConfig, () => playing);
  service.stop();

  await service.checkNow();
  const showFolder = nodePath.join(project, 'audio', 'Test & Show');
  assert.deepStrictEqual((await fs.readdir(showFolder)).sort(), ['2026-09-02 Second.mp3', '2026-09-03 Third.mp3']);
  assert.deepStrictEqual(server.downloads.sort(), ['e2', 'e3']);

  // A file that was already there is never touched, and the one playing isn't removed yet
  await fs.writeFile(nodePath.join(showFolder, 'my own file.mp3'), 'mine');
  playing = nodePath.join(showFolder, '2026-09-02 Second.mp3');
  server.episodes.unshift(episode('e4', 'Fourth', 4));
  await service.checkNow();
  assert.deepStrictEqual((await fs.readdir(showFolder)).sort(), [
    '2026-09-02 Second.mp3',
    '2026-09-03 Third.mp3',
    '2026-09-04 Fourth.mp3',
    'my own file.mp3'
  ]);

  // Once it has finished playing, it is removed
  playing = undefined;
  await service.checkNow();
  assert.deepStrictEqual((await fs.readdir(showFolder)).sort(), ['2026-09-03 Third.mp3', '2026-09-04 Fourth.mp3', 'my own file.mp3']);

  // An episode deleted by hand is not downloaded again
  await fs.remove(nodePath.join(showFolder, '2026-09-04 Fourth.mp3'));
  const downloadsBefore = server.downloads.length;
  await service.checkNow();
  assert.strictEqual(server.downloads.length, downloadsBefore);

  const status = await service.getStatus();
  assert.strictEqual(status.feeds[0].title, 'Test & Show');
  assert.strictEqual(status.feeds[0].latest, 'Fourth');
  assert.strictEqual(status.feeds[0].lastError, undefined);
  assert.ok(fs.existsSync(nodePath.join(project, service.STATE_FILE_NAME)));

  server.http.close();
  await fs.remove(project);
});

test('two episodes with the same name both download', async () => {
  const server = await startServer();
  server.episodes = [episode('a', 'Same', 5), episode('b', 'Same', 5)];
  const { project, getConfig } = await makeProject({
    api: {},
    radio: { audio_directory: './audio', video_directory: './video' },
    podcasts: { feeds: [`${server.url}/feed.xml`] }
  });
  const service = freshService();
  service.start(project, getConfig);
  service.stop();
  await service.checkNow();
  assert.strictEqual((await fs.readdir(nodePath.join(project, 'audio', 'Test & Show'))).length, 2);
  server.http.close();
  await fs.remove(project);
});

test('a feed that is down is reported, not fatal', async () => {
  const { project, getConfig } = await makeProject({
    api: {},
    radio: { audio_directory: './audio', video_directory: './video' },
    podcasts: { feeds: ['http://127.0.0.1:1/feed.xml'] }
  });
  const service = freshService();
  service.start(project, getConfig);
  service.stop();
  await service.checkNow();
  const status = await service.getStatus();
  assert.match(status.feeds[0].lastError || '', /Could not fetch the feed/);
  await fs.remove(project);
});

test('the api adds and removes feeds', async () => {
  const server = await startServer();
  server.episodes = [episode('e1', 'First', 1)];
  const { project, configPath, getConfig } = await makeProject({
    api: { key: 'test-key-0123456789' },
    radio: { audio_directory: './audio', video_directory: './video' }
  });
  const service = freshService();
  service.start(project, getConfig);
  service.stop();

  const fastify = require('fastify')();
  fastify.register(require('@fastify/formbody'));
  require('../src/api/podcasts')(fastify, project, {}, getConfig);
  const inject = (url, payload) =>
    fastify
      .inject({ method: 'POST', url: url, headers: { authorization: 'test-key-0123456789' }, payload: payload })
      .then(response => ({ status: response.statusCode, body: JSON.parse(response.payload) }));

  assert.strictEqual((await inject('/podcasts/feeds', { url: 'ftp://nope' })).status, 400);
  assert.match((await inject('/podcasts/feeds', { url: `${server.url}/missing.xml` })).body.message, /HTTP 404/);

  const added = await inject('/podcasts/feeds', { url: `${server.url}/feed.xml`, keep_latest: 5 });
  assert.strictEqual(added.status, 200, JSON.stringify(added.body));
  assert.strictEqual(added.body.feed.title, 'Test & Show');
  assert.deepStrictEqual((await fs.readJson(configPath)).podcasts.feeds, [
    { url: `${server.url}/feed.xml`, keep_latest: 5, directory: './audio/Test & Show' }
  ]);
  assert.strictEqual((await inject('/podcasts/feeds', { url: `${server.url}/feed.xml` })).status, 400);

  assert.strictEqual((await inject('/podcasts/feeds/remove', { url: `${server.url}/feed.xml` })).status, 200);
  assert.deepStrictEqual((await fs.readJson(configPath)).podcasts.feeds, []);

  await service.checkNow();
  server.http.close();
  await fs.remove(project);
});
