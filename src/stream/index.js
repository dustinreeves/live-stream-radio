const colors = require('../colors');
const stream = require('./stream.js');
const libraryService = require('../library.service');

// Wait before trying again after a track fails, doubling while it keeps failing
const MIN_RETRY_SECONDS = 2;
const MAX_RETRY_SECONDS = 60;

// Save our current path
let currentPath = undefined;

// Save our current getConfig cuntion
let currentGetConfig = undefined;

// Save the --output override from the cli, if any
let currentOutputLocation = undefined;

// The current track's ffmpeg process (see ffmpegProcess.js), once stream() resolves
let ffmpegProcessPromise = undefined;

// Whether the stream should be running: true from start(), including while waiting to retry
// after an error, until stop(). Killing ffmpeg throws an expected error,
// Thus we want to make sure we don't call our error callback if so
let shouldListenForFfmpegErrors = false;

// Counts ffmpeg runs. Each run's callbacks only act while it is still the current run:
// a killed ffmpeg can report its error after the next track has already started
// (e.g. on skip / restart), which used to be mistaken for the new track failing.
let streamRun = 0;

// A start scheduled by restart() or a retry. Only one can be pending, so quick repeated
// skips / play-nows can't start two streams at once
let pendingStartTimer = undefined;

// Tracks that failed in a row, reset when one plays to the end
let consecutiveFailures = 0;

const scheduleStart = delayMilliseconds => {
  clearTimeout(pendingStartTimer);
  pendingStartTimer = setTimeout(() => {
    pendingStartTimer = undefined;
    moduleExports.start();
  }, delayMilliseconds);
};

// Keep the station up after a failed track (a bad file, the stream server dropping us, ...),
// and try again with another track, waiting longer while it keeps failing
const retryAfterFailure = () => {
  consecutiveFailures++;
  const delaySeconds = Math.min(MAX_RETRY_SECONDS, MIN_RETRY_SECONDS * Math.pow(2, consecutiveFailures - 1));
  console.log(`${colors.yellow(`Trying again in ${delaySeconds} seconds`)} (${consecutiveFailures} failed in a row) 🔁`);
  console.log('\n');

  // A file may have been removed, look again
  libraryService.clearCache();
  scheduleStart(delaySeconds * 1000);
};

// Create our calbacks for stream end and error
const logFfmpegError = (err, stderr) => {
  console.log('\n');
  colors.line('red');
  console.log('\n');
  console.log(colors.red('ffmpeg stderr:'), '\n\n', stderr);
  console.log(colors.red('ffmpeg err:'), '\n\n', err.message);
  console.log('\n');
  console.log(`${colors.red('ffmpeg encountered an error.')} 😨`);
  console.log(`Please see the stderror output above to fix the issue.`);
  console.log('\n');
};

// Kill a started ffmpeg, and wait for it to exit
const killProcess = async ffmpegProcess => {
  if (ffmpegProcess) {
    await ffmpegProcess.kill();
  }
};

// Create our exports
const moduleExports = {
  // Start playing the next track. Never throws: a track that can't be started is retried
  start: async (path, getConfig, outputLocation) => {
    // Starting now replaces any start a restart or retry scheduled
    clearTimeout(pendingStartTimer);
    pendingStartTimer = undefined;

    console.log('\n');
    colors.line('white');
    console.log('\n');
    console.log(`${colors.green('Starting stream!')} 🛠️`);
    console.log('\n');

    if (path) {
      currentPath = path;
    }

    if (getConfig) {
      currentGetConfig = getConfig;
    }

    if (outputLocation) {
      currentOutputLocation = outputLocation;
    }

    // Listen for errors again
    shouldListenForFfmpegErrors = true;

    // Only let this run's ffmpeg end or fail the stream while it is the current one
    const run = ++streamRun;
    const isCurrentRun = () => run === streamRun;

    const runEndCallback = () => {
      if (isCurrentRun()) {
        consecutiveFailures = 0;
        // Simply start a new stream
        console.log('\n');
        moduleExports.start();
      }
    };
    const runErrorCallback = (err, stderr) => {
      if (isCurrentRun() && shouldListenForFfmpegErrors) {
        // Nothing else from this run should start a track
        streamRun++;
        ffmpegProcessPromise = undefined;
        logFfmpegError(err, stderr);
        retryAfterFailure();
      }
    };

    try {
      // Get our config, this will refresh on every song
      const config = await currentGetConfig();

      //  Build our stream outputs, from the config every time so url / key changes apply on the next song
      let streamOutput = currentOutputLocation;
      if (!streamOutput) {
        if (config.stream_outputs) {
          streamOutput = config.stream_outputs;
        } else {
          if (!config.stream_url || !config.stream_key) {
            throw new Error('Missing stream_url or stream_key in your config.json');
          }

          streamOutput = config.stream_url.replace('$stream_key', config.stream_key);
        }
      }

      // Don't print the stream key into the logs, they are visible in the web console
      let loggedOutputLocation = String(streamOutput);
      if (config.stream_key) {
        loggedOutputLocation = loggedOutputLocation.split(config.stream_key).join('<stream_key>');
      }
      console.log(`${colors.magenta('Streaming to:')} ${loggedOutputLocation}`);
      console.log('\n');

      // Stopped (or restarted) while getting ready
      if (!isCurrentRun()) {
        return;
      }

      // Start the stream again. A stop from here on waits for this promise, and kills what it started
      ffmpegProcessPromise = stream(currentPath, config, streamOutput, runEndCallback, runErrorCallback);
      await ffmpegProcessPromise;
    } catch (e) {
      if (!isCurrentRun()) {
        return;
      }
      ffmpegProcessPromise = undefined;
      console.log(`${colors.red('Could not start the track:')} ${e.message} 😟`);
      console.log('\n');
      retryAfterFailure();
    }
  },
  // Stop, then start again (with the next track) a second later
  restart: async () => {
    if (moduleExports.isRunning()) {
      await moduleExports.stop();
    }
    // Wrap in a set timeout, that way it wont crash and ffmpeg can continue
    scheduleStart(1000);
  },
  stop: async () => {
    console.log('\n');
    console.log(`${colors.magenta('Stopping stream...')} ✋`);
    console.log('\n');

    // A stop wins over a restart or retry that hasn't started yet
    clearTimeout(pendingStartTimer);
    pendingStartTimer = undefined;
    consecutiveFailures = 0;

    shouldListenForFfmpegErrors = false;
    // Anything the current ffmpeg reports from now on is from a stream we stopped on purpose
    streamRun++;

    const processPromise = ffmpegProcessPromise;
    ffmpegProcessPromise = undefined;
    if (processPromise) {
      // Get our process, and kill it
      let ffmpegProcess = undefined;
      try {
        ffmpegProcess = await processPromise;
      } catch (e) {
        // The track never started, so there is nothing to kill
      }
      await killProcess(ffmpegProcess);
    }

    require('../status.service').clearProgress();

    console.log('\n');
    console.log(`${colors.red('Stream stopped!')} 😃`);
    console.log('\n');
  },
  isRunning: () => {
    return shouldListenForFfmpegErrors;
  }
};

// Finally our exports
module.exports = moduleExports;
