const musicMetadata = require('music-metadata');

const authService = require('./auth');
const libraryService = require('../library.service');
const supportedFileTypes = require('../supportedFileTypes');
const { projectPath } = require('../configValues');

// Files read at once for ?include_metadata, so big libraries don't run out of open files
const METADATA_CONCURRENCY = 8;

const getAllAudio = async (path, getConfig) => {
  const config = await getConfig();
  return libraryService.listFiles(supportedFileTypes.supportedAudioTypes, projectPath(path, config.radio.audio_directory)).slice();
};

// Run task on every item, at most limit at a time, keeping the order
const mapWithLimit = async (items, limit, task) => {
  const results = new Array(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await task(items[index]);
    }
  };

  const workers = [];
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
};

const getAllAudioWithMetadata = async (path, getConfig) => {
  const audioFiles = await getAllAudio(path, getConfig);

  return mapWithLimit(audioFiles, METADATA_CONCURRENCY, async audioFile => {
    try {
      const metadata = await musicMetadata.parseFile(audioFile, { duration: true });
      const metadataCommon = metadata.common;
      delete metadataCommon.picture;
      return {
        path: audioFile,
        metadata: metadataCommon
      };
    } catch (e) {
      // One unreadable file shouldn't hide the rest of the library
      return {
        path: audioFile,
        metadata: {},
        error: e.message
      };
    }
  });
};

// File to return all of our /radio/* routes
module.exports = (fastify, path, stream, getConfig) => {
  addLibraryRoutes(fastify, path, stream, getConfig);
};

// Also used by the queue routes, to only allow queueing files from the library
module.exports.getAllAudio = getAllAudio;
module.exports.mapWithLimit = mapWithLimit;

const addLibraryRoutes = (fastify, path, stream, getConfig) => {
  fastify.get(
    '/library/audio',
    authService.secureRouteHandler(getConfig, async (request, reply) => {
      let response;
      if (request.query.include_metadata !== undefined) {
        response = await getAllAudioWithMetadata(path, getConfig);
      } else {
        response = await getAllAudio(path, getConfig);
      }

      reply.type('application/json').code(200);
      return {
        audio: response
      };
    })
  );
};
