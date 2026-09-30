const historyService = require('../history.service');
const statusService = require('../status.service');
const authService = require('./auth');

// Function to perform all checks before performing route
const preCheck = (stream, getConfig, fastify, request, reply) => {
  if (!stream) {
    reply.type('application/json').code(400);
    return {
      message: 'There is currently no stream'
    };
  }

  return;
};

// File to return all of our /stream/* routes
module.exports = (fastify, path, stream, getConfig) => {
  // Get stream status
  fastify.get(
    '/stream',
    authService.secureRouteHandler(getConfig, async (request, reply) => {
      reply.type('application/json').code(200);
      return {
        isRunning: stream.isRunning()
      };
    })
  );

  // Start the stream
  fastify.post(
    '/stream/start',
    authService.secureRouteHandler(getConfig, async (request, reply) => {
      const preCheckResponse = preCheck(stream, getConfig, fastify, request, reply);
      if (preCheckResponse) {
        return preCheckResponse;
      }

      if (!stream.isRunning()) {
        await stream.start();
      }

      reply.type('application/json').code(200);
      return {
        message: 'OK'
      };
    })
  );

  // Stop the stream
  fastify.post(
    '/stream/stop',
    authService.secureRouteHandler(getConfig, async (request, reply) => {
      const preCheckResponse = preCheck(stream, getConfig, fastify, request, reply);
      if (preCheckResponse) {
        return preCheckResponse;
      }

      if (stream.isRunning()) {
        await stream.stop();
      }

      reply.type('application/json').code(200);
      return {
        message: 'OK'
      };
    })
  );

  // Restart the stream
  fastify.post(
    '/stream/restart',
    authService.secureRouteHandler(getConfig, async (request, reply) => {
      const preCheckResponse = preCheck(stream, getConfig, fastify, request, reply);
      if (preCheckResponse) {
        return preCheckResponse;
      }

      await stream.restart();

      reply.type('application/json').code(200);
      return {
        message: 'OK'
      };
    })
  );

  // Stream History
  fastify.get(
    '/stream/history',
    authService.secureRouteHandler(getConfig, async (request, reply) => {
      reply.type('application/json').code(200);
      return {
        history: historyService.getHistory()
      };
    })
  );

  // Detailed status for the web console: what is playing and how far along it is
  fastify.get(
    '/stream/status',
    authService.secureRouteHandler(getConfig, async (request, reply) => {
      const isRunning = stream.isRunning();
      const history = historyService.getHistory();

      reply.type('application/json').code(200);
      return {
        isRunning: isRunning,
        nowPlaying: isRunning && history.length > 0 ? history[history.length - 1] : null,
        progress: isRunning ? statusService.getProgress() || null : null,
        uptime: Math.floor(process.uptime())
      };
    })
  );

  // Recent log output, pass ?since=<id> to only get newer lines
  fastify.get(
    '/stream/log',
    authService.secureRouteHandler(getConfig, async (request, reply) => {
      const since = parseInt(request.query.since, 10) || 0;

      reply.type('application/json').code(200);
      return {
        log: statusService.getLog(since)
      };
    })
  );

  // Returns 405
  fastify.post(
    '/stream',
    authService.secureRouteHandler(getConfig, async (request, reply) => {
      reply.type('application/json').code(405);
      return {};
    })
  );
  fastify.get(
    '/stream/start',
    authService.secureRouteHandler(getConfig, async (request, reply) => {
      reply.type('application/json').code(405);
      return {};
    })
  );
  fastify.get(
    '/stream/stop',
    authService.secureRouteHandler(getConfig, async (request, reply) => {
      reply.type('application/json').code(405);
      return {};
    })
  );
  fastify.get(
    '/stream/restart',
    authService.secureRouteHandler(getConfig, async (request, reply) => {
      reply.type('application/json').code(405);
      return {};
    })
  );
  fastify.post(
    '/stream/history',
    authService.secureRouteHandler(getConfig, async (request, reply) => {
      reply.type('application/json').code(405);
      return {};
    })
  );
};
