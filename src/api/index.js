const colors = require('../colors');
const fastify = require('fastify')({});

// www-form-urlencoded parser for fastify
fastify.register(require('@fastify/formbody'));

// Get our routes
const addStreamRoutes = require('./stream.js');
const addConfigRoutes = require('./config.js');
const addLibraryRoutes = require('./library.js');
const addConsoleRoutes = require('./console.js');
const addQueueRoutes = require('./queue.js');
const addPodcastRoutes = require('./podcasts.js');

let currentStream;
let currentGetConfig;

// Export our
module.exports = {
  start: async (path, getConfig, stream) => {
    // save a reference to our stream and config
    currentStream = stream;
    currentGetConfig = getConfig;

    // Create our base "Hello world" route
    fastify.get('/', async (request, reply) => {
      reply.type('application/json').code(200);
      // live_stream_radio is kept for clients written for the old name
      return {
        podcast_radio: 'Please see documentation for endpoints and usage',
        live_stream_radio: 'Please see documentation for endpoints and usage'
      };
    });

    // Implement our other routes
    addStreamRoutes(fastify, path, currentStream, currentGetConfig);
    addConfigRoutes(fastify, path, currentStream, currentGetConfig);
    addLibraryRoutes(fastify, path, currentStream, currentGetConfig);
    addConsoleRoutes(fastify, path, currentStream, currentGetConfig);
    addQueueRoutes(fastify, path, currentStream, currentGetConfig);
    addPodcastRoutes(fastify, path, currentStream, currentGetConfig);

    const config = await getConfig();

    const address = await fastify.listen({ port: parseInt(config.api.port, 10), host: config.api.host || 'localhost' });
    console.log('\n');
    console.log(`${colors.blue('API Started at:')} ${address}`);
  }
};
