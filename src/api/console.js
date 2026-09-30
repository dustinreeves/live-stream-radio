const fs = require('fs-extra');
const upath = require('upath');
const usersService = require('./users');

const consolePagePath = upath.join(__dirname, '..', 'console', 'index.html');

// Serves the web console page. The page itself holds no secrets,
// it signs in with a console user (or the api key) and sends that with every api request.
module.exports = (fastify, path, stream, getConfig) => {
  usersService.addRoutes(fastify, path, stream, getConfig);

  fastify.get('/console', async (request, reply) => {
    const config = await getConfig();
    if (!config.api.key && !usersService.hasUsers(config)) {
      reply.type('application/json').code(403);
      return {
        message: 'Add a console user (live-stream-radio --set-password) or set api.key in your config.json to use the web console'
      };
    }

    const page = await fs.readFile(consolePagePath);
    reply
      .type('text/html; charset=utf-8')
      .header('Cache-Control', 'no-store')
      .header('X-Frame-Options', 'DENY')
      .code(200);
    return page;
  });
};
