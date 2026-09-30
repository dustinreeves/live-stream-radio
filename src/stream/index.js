const chalk = require('chalk');
const chalkLine = require('chalkline');
const stream = require('./stream.js');

// Save our current path
let currentPath = undefined;

// Save our current getConfig cuntion
let currentGetConfig = undefined;

// Save the --output override from the cli, if any
let currentOutputLocation = undefined;

// Save a reference to our ffmpegCommand
let ffmpegCommandPromise = undefined;

// Killing ffmpeg throws an expected error,
// Thus we want to make sure we don't call our error callback if so
let shouldListenForFfmpegErrors = false;

// Counts ffmpeg runs. Each run's callbacks only act while it is still the current run:
// a killed ffmpeg can report its error after the next track has already started
// (e.g. on skip / restart), which used to be mistaken for the new track failing.
let streamRun = 0;

// Create our calbacks for stream end and error
const errorCallback = (err, stdout, stderr) => {
  // Check if we should respond to the error
  if (shouldListenForFfmpegErrors) {
    console.log('\n');
    chalkLine.red();
    console.log('\n');
    console.log(chalk.red('ffmpeg stderr:'), '\n\n', stderr);
    console.log(chalk.red('ffmpeg stdout:'), '\n\n', stdout);
    console.log(chalk.red('ffmpeg err:'), '\n\n', err);
    console.log('\n');
    console.log(`${chalk.red('ffmpeg encountered an error.')} 😨`);
    console.log(`Please see the stderror output above to fix the issue.`);
    console.log('\n');

    // Exit everything
    process.exit(1);
  }
};

const endCallback = () => {
  // Simply start a new stream
  console.log('\n');
  moduleExports.start();
};

// Create our exports
const moduleExports = {
  start: async (path, getConfig, outputLocation) => {
    console.log('\n');
    chalkLine.white();
    console.log('\n');
    console.log(`${chalk.green('Starting stream!')} 🛠️`);
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

    // Get our config, this will refresh on every song
    let config = await currentGetConfig();

    // Work around fluent-ffmpeg not understanding newer ffmpeg's format list
    await require('./ffmpegCompat')(config);

    //  Build our stream outputs, from the config every time so url / key changes apply on the next song
    let streamOutput = currentOutputLocation;
    if (!streamOutput) {
      if (config.stream_outputs) {
        streamOutput = config.stream_outputs;
      } else {
        if (!config.stream_url || !config.stream_key) {
          console.log(`${chalk.red('Missing stream_url or stream_key in your config.json !')} 😟`);
          console.log(chalk.red('Exiting...'));
          console.log('\n');
          process.exit(1);
        }

        let streamUrl = config.stream_url;
        streamUrl = streamUrl.replace('$stream_key', config.stream_key);
        streamOutput = streamUrl;
      }
    }

    // Don't print the stream key into the logs, they are visible in the web console
    let loggedOutputLocation = String(streamOutput);
    if (config.stream_key) {
      loggedOutputLocation = loggedOutputLocation.split(config.stream_key).join('<stream_key>');
    }
    console.log(`${chalk.magenta('Streaming to:')} ${loggedOutputLocation}`);
    console.log('\n');

    // Listen for errors again
    shouldListenForFfmpegErrors = true;

    // Only let this run's ffmpeg end or fail the stream while it is the current one
    const run = ++streamRun;
    const runEndCallback = () => {
      if (run === streamRun) {
        endCallback();
      }
    };
    const runErrorCallback = (err, stdout, stderr) => {
      if (run === streamRun) {
        errorCallback(err, stdout, stderr);
      }
    };

    // Start the stream again
    ffmpegCommandPromise = stream(currentPath, config, streamOutput, runEndCallback, runErrorCallback);
    await ffmpegCommandPromise;
  },
  stop: async () => {
    console.log('\n');
    console.log(`${chalk.magenta('Stopping stream...')} ✋`);
    console.log('\n');

    shouldListenForFfmpegErrors = false;
    // Anything the current ffmpeg reports from now on is from a stream we stopped on purpose
    streamRun++;
    if (ffmpegCommandPromise) {
      // Get our command, its pid, and kill it.
      const ffmpegCommand = await ffmpegCommandPromise;
      const ffmpegCommandPid = ffmpegCommand.ffmpegProc.pid;
      ffmpegCommand.kill();
      ffmpegCommandPromise = undefined;

      // Wait until the pid is no longer running
      const isRunning = require('is-running');
      await new Promise(resolve => {
        const waitForPidToBeKilled = () => {
          if (isRunning(ffmpegCommandPid)) {
            setTimeout(() => {
              waitForPidToBeKilled();
            }, 250);
          } else {
            resolve();
          }
        };
        waitForPidToBeKilled();
      });
    }

    require('../status.service').clearProgress();

    console.log('\n');
    console.log(`${chalk.red('Stream stopped!')} 😃`);
    console.log('\n');
  },
  isRunning: () => {
    return shouldListenForFfmpegErrors;
  }
};

// Finally our exports
module.exports = moduleExports;
