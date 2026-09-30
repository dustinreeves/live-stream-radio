const colors = require('../colors');
const musicMetadata = require('../musicMetadata');
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
const { startFfmpeg } = require('./ffmpegProcess');
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

// Function to start a stream. Resolves with the ffmpeg process (see ffmpegProcess.js) once ffmpeg has been started,
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
      console.log(colors.yellow(`Skipping a requested track that no longer exists: ${queued.path}`));
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
    console.log(colors.magenta(`Playing an ${typeKey}...`));
    console.log('\n');
  }

  console.log(colors.magenta(`Finding audio... 🎤`));
  console.log('\n');

  // Find a random song from the config directory, unless one was requested
  const randomSong =
    requestedSong ||
    (await getRandomFileWithExtensionFromPath(supportedFileTypes.supportedAudioTypes, projectPath(path, typeConfig.audio_directory)));

  console.log(colors.blue(requestedSong ? `Playing the requested audio:` : `Playing the audio:`));
  console.log(randomSong);
  console.log('\n');

  console.log(colors.magenta(`Finding/Optimizing video... 📺`));
  console.log('\n');

  // Get the stream video, the prepared one if it is for this type of track
  const video = preparedVideo && preparedVideo.typeKey === typeKey ? preparedVideo : await getVideo(path, config, typeKey);
  const randomVideo = video.randomVideo;
  const optimizedVideo = video.optimizedVideo;

  console.log(colors.blue(`Playing the video:`));
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
    console.log(colors.yellow(`Artist: ${metadata.common.artist}`));
  }
  if (metadata.common.album) {
    console.log(colors.yellow(`Album: ${metadata.common.album}`));
  }
  if (metadata.common.title) {
    console.log(colors.yellow(`Song: ${metadata.common.title}`));
  }
  console.log(colors.yellow(`Duration (seconds): ${Math.ceil(songDuration)}`));
  console.log('\n');
  // Log a album cover if available, in terminals that can show images (e.g. iTerm2)
  if (metadata.common.picture && metadata.common.picture.length > 0 && process.stdout.isTTY) {
    try {
      const termImg = (await import('term-img')).default;
      const image = termImg(metadata.common.picture[0].data, {
        width: '300px',
        height: 'auto',
        fallback: () => ''
      });
      if (image) {
        console.log(image);
        console.log('\n');
      }
    } catch (e) {
      // Do nothing, we dont need the album art
    }
  }

  // Where the stream goes, one output or several
  const outputTarget = ffmpegOptions.getOutputTarget(outputLocation);

  const args = [
    // Add the video input, looped infinitely
    '-stream_loop',
    '-1',
    '-i',
    optimizedVideo,
    // Add our audio as input
    '-i',
    randomSong,
    // Add a silent input
    // This is useful for setting the stream -re
    // pace, as well as not causing any weird bugs where we only have a video
    // And no audio output
    // https://trac.ffmpeg.org/wiki/Null#anullsrc
    // -f lavfi: Indicate we are a virtual input
    // -re: Livestream, encode in realtime as audio comes in
    // https://superuser.com/questions/508560/ffmpeg-stream-a-file-with-original-playing-rate
    // Need the -re here as video can drastically reduce input speed, and input audio has delay
    '-f',
    'lavfi',
    '-re',
    '-i',
    'anullsrc'
  ];

  // Add our overlay image input, if enabled
  let imageObject = undefined;
  if (
    typeConfig.overlay &&
    isEnabled(typeConfig.overlay.enabled) &&
    typeConfig.overlay.image &&
    isEnabled(typeConfig.overlay.image.enabled)
  ) {
    imageObject = typeConfig.overlay.image;
    args.push('-i', projectPath(path, imageObject.image_path));
  }

  // Apply our complex filter, with the overlay image and text
  const overlayTextFilterString = await getOverlayTextString(path, config, typeKey, metadata, randomSong);
  args.push('-filter_complex', ffmpegOptions.buildComplexFilter(config, imageObject, overlayTextFilterString));

  // Add our output options for the stream, and overwrite the output if it's a file
  const streamDuration = ffmpegOptions.getStreamDuration(songDuration);
  args.push(...ffmpegOptions.buildOutputOptions(config, streamDuration), ...outputTarget.options, '-y', outputTarget.location);

  // Let's create a nice progress bar
  // Using the song length as the 100%, as that is when the stream should end
  const songTotalDuration = Math.floor(songDuration);
  const progressBar = new progress.SingleBar(
    {
      format: 'Audio Progress {bar} {percentage}% | Time Playing: {duration_formatted} |'
    },
    progress.Presets.shades_classic
  );

  // Finally, start ffmpeg, and wait until it is running (or failed to start)
  let ffmpegProcess;
  await new Promise(resolve => {
    ffmpegProcess = startFfmpeg(config.ffmpeg_path, args, {
      start: commandLine => {
        console.log(' ');
        console.log(`${colors.blue('Spawned Ffmpeg with command:')}`);
        // Hide the stream key, the log is visible in the web console
        console.log(config.stream_key ? commandLine.split(config.stream_key).join('<stream_key>') : commandLine);
        console.log(' ');

        // Start our progress bar
        progressBar.start(songTotalDuration, 0);
        resolve();
      },
      progress: status => {
        const seconds = Math.max(0, Math.floor(status.seconds));

        // Set seconds onto progressBar
        progressBar.update(Math.min(seconds, songTotalDuration));

        // Save for the api / web console
        statusService.setProgress({
          seconds: seconds,
          fps: status.fps,
          kbps: status.kbps
        });
      },
      end: () => {
        progressBar.stop();
        if (endCallback) {
          endCallback();
        }
      },
      error: (err, stderr) => {
        progressBar.stop();
        resolve();

        if (errorCallback) {
          errorCallback(err, stderr);
        }
      }
    });
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
      console.log(colors.yellow(`Could not prepare the next video, trying again when the next track starts: ${e.message}`));
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

  return ffmpegProcess;
};
