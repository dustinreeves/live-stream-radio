// Get our ffmpeg
const ffmpeg = require('fluent-ffmpeg');
const chalk = require('chalk');
const musicMetadata = require('music-metadata');
const progress = require('cli-progress');

// Get our Services and helper fucntions
const fs = require('fs');
const historyService = require('../history.service');
const statusService = require('../status.service');
const queueService = require('../queue.service');
const supportedFileTypes = require('../supportedFileTypes');
const getRandomFileWithExtensionFromPath = require('./randomFile');
const getOverlayTextString = require('./overlayText');
const ffmpegOptions = require('./ffmpegOptions');
const { isEnabled, projectPath } = require('../configValues');

// The video for the next track, prepared while this one plays: { typeKey, randomVideo, optimizedVideo }
let nextVideo = undefined;

// Counts tracks, so a preparation that finishes after its track already started is thrown away
let preRenderId = 0;

const getTypeKey = config => {
  let typeKey = 'radio';
  if (config.interlude && isEnabled(config.interlude.enabled)) {
    const randomNumber = Math.random();
    const frequency = parseFloat(config.interlude.frequency, 10);
    if (randomNumber <= frequency) {
      typeKey = 'interlude';
    }
  }

  return typeKey;
};

const getTypeConfig = (config, typeKey) => {
  if (!config[typeKey]) {
    throw new Error(`Your config is missing its "${typeKey}" section`);
  }
  return config[typeKey];
};

const getVideo = async (path, config, typeKey) => {
  const randomVideo = await getRandomFileWithExtensionFromPath(
    supportedFileTypes.supportedVideoTypes,
    projectPath(path, getTypeConfig(config, typeKey).video_directory)
  );

  // Do some optimizations to our video as we need
  let optimizedVideo;
  if (/\.gif$/i.test(randomVideo)) {
    // Optimize gif
    optimizedVideo = await require('./gif.js').getOptimizedGif(randomVideo, config);
  } else {
    optimizedVideo = randomVideo;
  }

  return {
    typeKey: typeKey,
    randomVideo: randomVideo,
    optimizedVideo: optimizedVideo
  };
};

// Function to start a stream. Resolves with the fluent-ffmpeg command once ffmpeg has been started,
// and throws if the track can't be started (no files, unreadable song, ...)
module.exports = async (path, config, outputLocation, endCallback, errorCallback) => {
  // Anything still being prepared is for an earlier track
  preRenderId++;
  const preparedVideo = nextVideo;
  nextVideo = undefined;

  // A track requested from the web console plays before anything random, skipping interludes.
  // Skip requests whose file has gone away (e.g. the audio folder changed)
  let requestedSong = undefined;
  while (queueService.hasTracks() && !requestedSong) {
    const queued = queueService.take();
    if (fs.existsSync(queued.path)) {
      requestedSong = queued.path;
    } else {
      console.log(chalk.yellow(`Skipping a requested track that no longer exists: ${queued.path}`));
    }
  }

  // Find what type of stream we want, radio, interlude, etc...
  // Follow the prepared video's type, so it fits the track
  let typeKey;
  if (requestedSong) {
    typeKey = 'radio';
  } else if (preparedVideo) {
    typeKey = preparedVideo.typeKey;
  } else {
    typeKey = getTypeKey(config);
  }
  const typeConfig = getTypeConfig(config, typeKey);

  if (typeKey !== 'radio') {
    console.log(chalk.magenta(`Playing an ${typeKey}...`));
    console.log('\n');
  }

  console.log(chalk.magenta(`Finding audio... 🎤`));
  console.log('\n');

  // Find a random song from the config directory, unless one was requested
  const randomSong =
    requestedSong ||
    (await getRandomFileWithExtensionFromPath(supportedFileTypes.supportedAudioTypes, projectPath(path, typeConfig.audio_directory)));

  console.log(chalk.blue(requestedSong ? `Playing the requested audio:` : `Playing the audio:`));
  console.log(randomSong);
  console.log('\n');

  console.log(chalk.magenta(`Finding/Optimizing video... 📺`));
  console.log('\n');

  // Get the stream video, the prepared one if it is for this type of track
  const video = preparedVideo && preparedVideo.typeKey === typeKey ? preparedVideo : await getVideo(path, config, typeKey);
  const randomVideo = video.randomVideo;
  const optimizedVideo = video.optimizedVideo;

  console.log(chalk.blue(`Playing the video:`));
  console.log(randomVideo);
  console.log('\n');

  // Get the information about the song
  const metadata = await musicMetadata.parseFile(randomSong, { duration: true });
  const songDuration = metadata.format.duration;
  if (!(songDuration > 0)) {
    throw new Error(`Could not read how long ${randomSong} is`);
  }

  // Log data about the song
  if (metadata.common.artist) {
    console.log(chalk.yellow(`Artist: ${metadata.common.artist}`));
  }
  if (metadata.common.album) {
    console.log(chalk.yellow(`Album: ${metadata.common.album}`));
  }
  if (metadata.common.title) {
    console.log(chalk.yellow(`Song: ${metadata.common.title}`));
  }
  console.log(chalk.yellow(`Duration (seconds): ${Math.ceil(songDuration)}`));
  console.log('\n');
  // Log a album cover if available
  if (metadata.common.picture && metadata.common.picture.length > 0) {
    // windows is not supported by termImg
    // process.platform always will be win32 on windows, no matter if it is 32bit or 64bit
    if (process.platform != 'win32') {
      try {
        const termImg = require('term-img');
        termImg(metadata.common.picture[0].data, {
          width: '300px',
          height: 'auto'
        });
        console.log('\n');
      } catch (e) {
        // Do nothing, we dont need the album art
      }
    }
  }

  // Where the stream goes, one output or several
  const outputTarget = ffmpegOptions.getOutputTarget(outputLocation);

  // Create a new command
  let ffmpegCommand = ffmpeg();

  // Set our ffmpeg path if we have one
  if (config.ffmpeg_path) {
    ffmpegCommand = ffmpegCommand.setFfmpegPath(config.ffmpeg_path);
  }

  // Add the video input
  ffmpegCommand = ffmpegCommand.input(optimizedVideo).inputOptions([
    // Loop the video infinitely
    `-stream_loop -1`
  ]);

  // Add our audio as input
  ffmpegCommand = ffmpegCommand.input(randomSong);

  // Add a silent input
  // This is useful for setting the stream -re
  // pace, as well as not causing any weird bugs where we only have a video
  // And no audio output
  // https://trac.ffmpeg.org/wiki/Null#anullsrc
  ffmpegCommand = ffmpegCommand.input('anullsrc').inputOptions([
    // Indicate we are a virtual input
    `-f lavfi`,
    // Livestream, encode in realtime as audio comes in
    // https://superuser.com/questions/508560/ffmpeg-stream-a-file-with-original-playing-rate
    // Need the -re here as video can drastically reduce input speed, and input audio has delay
    `-re`
  ]);

  // Add our overlay image input, if enabled
  let imageObject = undefined;
  if (
    typeConfig.overlay &&
    isEnabled(typeConfig.overlay.enabled) &&
    typeConfig.overlay.image &&
    isEnabled(typeConfig.overlay.image.enabled)
  ) {
    imageObject = typeConfig.overlay.image;
    ffmpegCommand = ffmpegCommand.input(projectPath(path, imageObject.image_path));
  }

  // Apply our complex filter, with the overlay image and text
  const overlayTextFilterString = await getOverlayTextString(path, config, typeKey, metadata, randomSong);
  ffmpegCommand = ffmpegCommand.complexFilter(ffmpegOptions.buildComplexFilter(config, imageObject, overlayTextFilterString));

  // Let's create a nice progress bar
  // Using the song length as the 100%, as that is when the stream should end
  const songTotalDuration = Math.floor(songDuration);
  const progressBar = new progress.Bar(
    {
      format: 'Audio Progress {bar} {percentage}% | Time Playing: {duration_formatted} |'
    },
    progress.Presets.shades_classic
  );

  // Set our event handlers
  ffmpegCommand = ffmpegCommand
    .on('start', commandString => {
      console.log(' ');
      console.log(`${chalk.blue('Spawned Ffmpeg with command:')}`);
      // Hide the stream key, the log is visible in the web console
      console.log(config.stream_key ? commandString.split(config.stream_key).join('<stream_key>') : commandString);
      console.log(' ');

      // Start our progress bar
      progressBar.start(songTotalDuration, 0);
    })
    .on('end', () => {
      progressBar.stop();
      if (endCallback) {
        endCallback();
      }
    })
    .on('error', (err, stdout, stderr) => {
      progressBar.stop();

      if (errorCallback) {
        errorCallback(err, stdout, stderr);
      }
    })
    .on('progress', progress => {
      // Get our timestamp
      const timestamp = progress.timemark.substring(0, 8);
      const splitTimestamp = timestamp.split(':');
      const seconds = parseInt(splitTimestamp[0], 10) * 60 * 60 + parseInt(splitTimestamp[1], 10) * 60 + parseInt(splitTimestamp[2], 10);

      // Set seconds onto progressBar
      progressBar.update(seconds);

      // Save for the api / web console
      statusService.setProgress({
        seconds: seconds,
        fps: progress.currentFps,
        kbps: progress.currentKbps
      });
    });

  // Add our output options for the stream
  const streamDuration = ffmpegOptions.getStreamDuration(songDuration);
  ffmpegCommand = ffmpegCommand.outputOptions([...ffmpegOptions.buildOutputOptions(config, streamDuration), ...outputTarget.options]);

  // Finally, save the stream to our stream URL. fluent-ffmpeg starts ffmpeg a moment later,
  // wait for that so the command can be stopped (it has no process to kill until then)
  await new Promise(resolve => {
    ffmpegCommand.once('start', () => resolve());
    ffmpegCommand.once('error', () => resolve());
    ffmpegCommand.save(outputTarget.location);
  });

  // Prepare the next track's video while this one plays
  // Requested tracks skip interludes, so don't prepare an interlude video while any are waiting
  const thisPreRenderId = preRenderId;
  const nextTypeKey = queueService.hasTracks() ? 'radio' : getTypeKey(config);
  getVideo(path, config, nextTypeKey)
    .then(video => {
      if (thisPreRenderId === preRenderId) {
        nextVideo = video;
      }
    })
    .catch(e => {
      console.log(chalk.yellow(`Could not prepare the next video, trying again when the next track starts: ${e.message}`));
    });

  // Add this item to our history
  const historyMetadata = metadata.common;
  delete historyMetadata.picture;
  statusService.clearProgress();
  historyService.addItemToHistory({
    type: typeKey,
    requested: Boolean(requestedSong),
    audio: {
      path: randomSong,
      duration: songDuration,
      metadata: historyMetadata
    },
    video: {
      path: randomVideo
    }
  });

  return ffmpegCommand;
};
