// Builds the ffmpeg filter graph and output options for a track, from the config
const { isEnabled } = require('../configValues');

// Silence added in front of the song, to prevent / help with stream cutoff, in milliseconds
const AUDIO_DELAY_MILLISECONDS = 3000;

const DEFAULT_FPS = '24';
const DEFAULT_WIDTH = 854;
const DEFAULT_HEIGHT = 480;
const DEFAULT_SAMPLE_RATE = 44100;

const getFps = config => {
  return config.video_fps ? String(config.video_fps) : DEFAULT_FPS;
};

const getVideoSize = config => {
  const width = parseInt(config.video_width, 10);
  const height = parseInt(config.video_height, 10);
  if (width > 0 && height > 0) {
    return { width: width, height: height };
  }
  return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
};

// Inputs are: 0 the video, 1 the song, 2 silence (anullsrc), 3 the overlay image (when imageObject is given)
const buildComplexFilter = (config, imageObject, overlayTextFilterString) => {
  const filters = [];

  // Add silence in front of song to prevent / help with stream cutoff
  // Since audio is streo, we have two channels
  // https://ffmpeg.org/ffmpeg-filters.html#adelay
  filters.push(`[1:a] adelay=${AUDIO_DELAY_MILLISECONDS}|${AUDIO_DELAY_MILLISECONDS} [delayedaudio]`);

  // Mix our silent and song audio, se we always have an audio stream
  // https://ffmpeg.org/ffmpeg-filters.html#amix
  // amix scales each input by 1 / (number of inputs), which made songs play at half volume,
  // so volume=2 undoes that. (amix's normalize=0 would too, but older ffmpeg builds don't have it.)
  let audioFilter = `[delayedaudio][2:a] amix=inputs=2:duration=first:dropout_transition=3, volume=2`;

  // Check if we want normalized audio
  if (isEnabled(config.normalize_audio)) {
    // Use the loudnorm filter
    // http://ffmpeg.org/ffmpeg-filters.html#loudnorm
    // loudnorm outputs 192kHz, more than aac can take, so bring it back down. The channel layout is given too:
    // with only a sample rate, ffmpeg 5.x can fail to pick one ("Cannot select channel layout") and stop
    const sampleRate = parseInt(config.audio_sample_rate, 10) || DEFAULT_SAMPLE_RATE;
    audioFilter += `, loudnorm, aformat=sample_rates=${sampleRate}:channel_layouts=stereo`;
  }
  filters.push(`${audioFilter} [audiooutput]`);

  // Okay this some weirdness. Involving fps.
  // So since we are realtime encoding to get the video to stream
  // At an apporpriate rate, this means that we encode a certain number of frames to match this
  // Now, let's say we have a 60fps input video, and want to output 24 fps. This is fine and work
  // FFMPEG will output at ~24 fps (little more or less), and video will run at correct rate.
  // But if you noticed the output "Current FPS" will slowly degrade to either the input
  // our output fps. Therefore if we had an input video at lest say 8 fps, it will slowly
  // Degrade to 8 fps, and then we start buffering. Thus we need to use a filter to force
  // The input video to be converted to the output fps to get the correct speed at which frames are rendered
  // The video is scaled to the output size first, so overlays are drawn at the size they are streamed at.
  const size = getVideoSize(config);
  let videoFilter = `[0:v] fps=fps=${getFps(config)}, scale=${size.width}:${size.height}`;

  // Add our overlay image, scaled to the video's size
  if (imageObject) {
    videoFilter +=
      ` [inputvideo]; ` +
      `[3:v] scale=${size.width}:${size.height} [overlayimage]; ` +
      `[inputvideo][overlayimage] overlay=x=${imageObject.position_x}:y=${imageObject.position_y}`;
  }

  // Add our overlayText
  if (overlayTextFilterString) {
    videoFilter += `, ${overlayTextFilterString}`;
  }

  filters.push(`${videoFilter} [videooutput]`);

  return filters.join('; ');
};

// The length of the stream for a song: the song, plus some beginning and ending padding.
// This is done instead of using the -shortest flag
// Because of a bug where -shortest can't be used with complex audio filter
// https://trac.ffmpeg.org/ticket/3789
const getStreamDuration = songDuration => {
  const delayInSeconds = Math.ceil(AUDIO_DELAY_MILLISECONDS / 1000);
  return delayInSeconds * 2 + Math.ceil(songDuration);
};

// Create our ouput options, as ffmpeg arguments
// Good starting point: https://wiki.archlinux.org/index.php/Streaming_to_twitch.tv
const buildOutputOptions = (config, streamDuration) => {
  const fps = getFps(config);

  // Some defaults we don't want change
  const outputOptions = [
    '-map',
    '[videooutput]',
    '-map',
    '[audiooutput]',
    // Our fps from earlier
    '-r',
    String(fps),
    // Group of pictures, want to set to 2 seconds
    // https://trac.ffmpeg.org/wiki/EncodingForStreamingSites
    // https://www.addictivetips.com/ubuntu-linux-tips/stream-to-twitch-command-line-linux/
    // Best Explanation: https://superuser.com/questions/908280/what-is-the-correct-way-to-fix-keyframes-in-ffmpeg-for-dash
    '-g',
    String(parseInt(fps, 10) * 2),
    '-keyint_min',
    String(fps),
    // Stop audio once we hit the specified duration
    '-t',
    String(streamDuration),
    // https://trac.ffmpeg.org/wiki/EncodingForStreamingSites
    '-pix_fmt',
    'yuv420p'
  ];

  if (config.video_bit_rate) {
    outputOptions.push(
      '-b:v',
      String(config.video_bit_rate),
      '-minrate',
      String(config.video_bit_rate),
      '-maxrate',
      String(config.video_bit_rate)
    );
  }

  if (config.audio_bit_rate) {
    outputOptions.push('-b:a', String(config.audio_bit_rate));
  }

  if (config.audio_sample_rate) {
    outputOptions.push('-ar', String(config.audio_sample_rate));
  }

  // Set our audio codec, this can drastically affect performance
  outputOptions.push('-acodec', String(config.audio_codec || 'aac'));

  // Set our video codec, and encoder options
  // https://trac.ffmpeg.org/wiki/EncodingForStreamingSites
  outputOptions.push('-vcodec', String(config.video_codec || 'libx264'));
  if (config.preset) {
    outputOptions.push('-preset', String(config.preset));
  }
  if (config.bufsize) {
    outputOptions.push('-bufsize', String(config.bufsize));
  }
  if (config.crf) {
    outputOptions.push('-crf', String(config.crf));
  }
  if (config.threads) {
    outputOptions.push('-threads', String(config.threads));
  }

  return outputOptions;
};

// Escape an output url for ffmpeg's tee muxer
const escapeTeeOutput = output => {
  return output.replace(/[\\'|[\]]/g, '\\$&');
};

// Where to send the stream: one output, or several at once (e.g. YouTube and Twitch)
// Returns the ffmpeg output location and the arguments that go with it
const getOutputTarget = outputLocation => {
  const outputs = (Array.isArray(outputLocation) ? outputLocation : [outputLocation]).filter(output => {
    return typeof output === 'string' && output.length > 0;
  });

  if (outputs.length === 0) {
    throw new Error('There is no stream output, set stream_url and stream_key (or stream_outputs) in your config.json');
  }

  // Set format to flv (Youtube/Twitch)
  if (outputs.length === 1) {
    return { location: outputs[0], options: ['-f', 'flv'] };
  }

  // ffmpeg's tee muxer encodes once and sends to all of them. If one output fails
  // (onfail=ignore) the others keep going
  return {
    location: outputs.map(output => `[f=flv:onfail=ignore]${escapeTeeOutput(output)}`).join('|'),
    options: ['-flags', '+global_header', '-f', 'tee']
  };
};

module.exports = {
  AUDIO_DELAY_MILLISECONDS: AUDIO_DELAY_MILLISECONDS,
  getVideoSize: getVideoSize,
  buildComplexFilter: buildComplexFilter,
  getStreamDuration: getStreamDuration,
  buildOutputOptions: buildOutputOptions,
  getOutputTarget: getOutputTarget
};
