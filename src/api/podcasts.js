const fs = require('fs');
const nodePath = require('path');
const authService = require('./auth');
const configFile = require('../configFile');
const podcastsService = require('../podcasts/podcasts.service');

const DEFAULT_KEEP_LATEST = 10;

const jsonResponse = (reply, code, body) => {
  reply.type('application/json').code(code);
  return body;
};

// File to return our /podcasts routes, for the podcast feeds episodes are downloaded from
module.exports = (fastify, path, stream, getConfig) => {
  const configPath = nodePath.join(path, 'config.json');

  // Feeds are added to config.json, which a project using config.js doesn't read
  const readEditableConfig = async () => {
    if (fs.existsSync(nodePath.join(path, 'config.js'))) {
      throw new Error('This project uses config.js, add feeds there under podcasts.feeds');
    }
    return configFile.readConfig(configPath);
  };

  fastify.get(
    '/podcasts',
    authService.secureRouteHandler(getConfig, async (request, reply) => {
      return jsonResponse(reply, 200, await podcastsService.getStatus());
    })
  );

  // Check the feeds now, rather than waiting for the next check. Returns straight away
  fastify.post(
    '/podcasts/check',
    authService.secureRouteHandler(getConfig, async (request, reply) => {
      podcastsService.checkNow();
      return jsonResponse(reply, 200, await podcastsService.getStatus());
    })
  );

  // Add a feed. Body: { url, keep_latest (optional, default 10, 0 keeps every episode) }
  fastify.post(
    '/podcasts/feeds',
    authService.secureRouteHandler(getConfig, async (request, reply) => {
      const body = request.body || {};
      const url = typeof body.url === 'string' ? body.url.trim() : '';
      if (!/^https?:\/\//i.test(url)) {
        return jsonResponse(reply, 400, { message: 'The feed url must start with http:// or https://' });
      }
      const keepLatest = body.keep_latest === undefined || body.keep_latest === '' ? DEFAULT_KEEP_LATEST : parseInt(body.keep_latest, 10);
      if (!(keepLatest >= 0)) {
        return jsonResponse(reply, 400, { message: 'keep_latest must be 0 (keep every episode) or more' });
      }

      let config;
      try {
        config = await readEditableConfig();
      } catch (e) {
        return jsonResponse(reply, 400, { message: e.message });
      }
      if (podcastsService.getFeedConfigs(config).some(feed => feed.url === url)) {
        return jsonResponse(reply, 400, { message: 'That feed is already added' });
      }

      // Read it first, so a wrong url is caught now, and the show's folder can be named after it
      let feed;
      try {
        feed = await podcastsService.readFeed(url);
      } catch (e) {
        return jsonResponse(reply, 400, { message: e.message });
      }
      if (feed.episodes.length === 0) {
        return jsonResponse(reply, 400, { message: `"${feed.title}" has no audio episodes the stream can play` });
      }

      const newFeed = { url: url, keep_latest: keepLatest, directory: podcastsService.getDefaultDirectory(config, feed.title) };
      const feeds = config.podcasts && Array.isArray(config.podcasts.feeds) ? config.podcasts.feeds : [];
      configFile.setValue(config, 'podcasts.feeds', feeds.concat([newFeed]));
      await configFile.writeConfig(configPath, config);
      console.log(`Added the podcast feed "${feed.title}" (${url})`);

      podcastsService.checkNow();
      return jsonResponse(reply, 200, { feed: Object.assign({ title: feed.title, episodesInFeed: feed.episodes.length }, newFeed) });
    })
  );

  // Remove a feed. Episodes already downloaded stay, delete their folder to remove them. Body: { url }
  fastify.post(
    '/podcasts/feeds/remove',
    authService.secureRouteHandler(getConfig, async (request, reply) => {
      const body = request.body || {};
      let config;
      try {
        config = await readEditableConfig();
      } catch (e) {
        return jsonResponse(reply, 400, { message: e.message });
      }
      const feeds = config.podcasts && Array.isArray(config.podcasts.feeds) ? config.podcasts.feeds : [];
      const remaining = feeds.filter(feed => (typeof feed === 'string' ? feed : feed && feed.url) !== body.url);
      if (remaining.length === feeds.length) {
        return jsonResponse(reply, 404, { message: 'That feed is not in the config' });
      }
      configFile.setValue(config, 'podcasts.feeds', remaining);
      await configFile.writeConfig(configPath, config);
      console.log(`Removed the podcast feed ${body.url}`);
      return jsonResponse(reply, 200, await podcastsService.getStatus());
    })
  );
};
