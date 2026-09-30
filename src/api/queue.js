const authService = require('./auth');
const queueService = require('../queue.service');
const { getAllAudio } = require('./library');

// File to return our /stream/queue routes, for picking tracks from the web console
module.exports = (fastify, path, stream, getConfig) => {
  const queueResponse = reply => {
    reply.type('application/json').code(200);
    return { queue: queueService.getQueue() };
  };

  fastify.get(
    '/stream/queue',
    authService.secureRouteHandler(getConfig, async (request, reply) => {
      return queueResponse(reply);
    })
  );

  // Queue a track from the library.
  // Body: { path, play_next (put it first), play_now (put it first and skip to it) }
  fastify.post(
    '/stream/queue',
    authService.secureRouteHandler(getConfig, async (request, reply) => {
      const body = request.body || {};

      // Only files the library lists can be queued, never an arbitrary path
      const library = await getAllAudio(path, getConfig);
      if (typeof body.path !== 'string' || library.indexOf(body.path) === -1) {
        reply.type('application/json').code(400);
        return { message: 'That track is not in the library' };
      }

      const playNow = body.play_now === true;
      if (!queueService.add(body.path, playNow || body.play_next === true)) {
        reply.type('application/json').code(400);
        return { message: 'The queue is full' };
      }
      console.log(`Web console queued${playNow ? ' (playing now)' : ''}: ${body.path}`);

      if (playNow) {
        // Same as a skip: the next track is now this one
        await stream.restart();
      }

      return queueResponse(reply);
    })
  );

  // Body: { index, path (optional: only remove if that's still the track at index) }
  fastify.post(
    '/stream/queue/remove',
    authService.secureRouteHandler(getConfig, async (request, reply) => {
      const body = request.body || {};
      const index = parseInt(body.index, 10);
      const item = queueService.getQueue()[index];
      if (item && typeof body.path === 'string' && item.path !== body.path) {
        reply.type('application/json').code(409);
        return { message: 'The queue changed, try again', queue: queueService.getQueue() };
      }
      if (!queueService.remove(index)) {
        reply.type('application/json').code(400);
        return { message: 'No queued track at that position' };
      }
      return queueResponse(reply);
    })
  );

  fastify.post(
    '/stream/queue/clear',
    authService.secureRouteHandler(getConfig, async (request, reply) => {
      queueService.clear();
      return queueResponse(reply);
    })
  );
};
