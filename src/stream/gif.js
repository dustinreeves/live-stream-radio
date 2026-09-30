const crypto = require('crypto');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs-extra');
const upath = require('upath');
const os = require('os');

const DEFAULT_MAX_GIF_SIZE = 720;

// Converted gifs are kept here and reused, rather than converting the same gif for every track
const cacheDirectory = upath.join(os.tmpdir(), 'live-stream-radio-gifs');

const runFfmpeg = (config, setUpCommand, outputPath) => {
  return new Promise((resolve, reject) => {
    let ffmpegCommand = ffmpeg();
    // Set our ffmpeg path if we have one
    if (config.ffmpeg_path) {
      ffmpegCommand = ffmpegCommand.setFfmpegPath(config.ffmpeg_path);
    }

    setUpCommand(ffmpegCommand)
      .on('end', () => resolve())
      .on('error', (err, stdout, stderr) => {
        reject(new Error(`ffmpeg could not convert the gif: ${err.message}\n${stderr || ''}`));
      })
      .save(outputPath);
  });
};

// Async function to optimize a gif using ffmpeg, returns the path of the optimized gif
// http://blog.pkh.me/p/21-high-quality-gif-with-ffmpeg.html
const getOptimizedGif = async (gifPath, config) => {
  const maxGifSize = parseInt(config.max_gif_size, 10) || DEFAULT_MAX_GIF_SIZE;

  // A changed gif (or max_gif_size) gets a new name, so it is converted again
  const stats = await fs.stat(gifPath);
  const cacheKey = crypto
    .createHash('sha1')
    .update([gifPath, stats.size, stats.mtime.getTime(), maxGifSize].join('\n'))
    .digest('hex')
    .substr(0, 16);
  const optimizedGifPath = upath.join(cacheDirectory, `${cacheKey}.gif`);
  if (await fs.pathExists(optimizedGifPath)) {
    return optimizedGifPath;
  }

  await fs.ensureDir(cacheDirectory);
  const tempName = `${cacheKey}-${process.pid}-${Date.now()}`;
  const palettePath = upath.join(cacheDirectory, `${tempName}-palette.png`);
  const partialGifPath = upath.join(cacheDirectory, `${tempName}-partial.gif`);

  try {
    // Create the gif pallete using ffmpeg
    await runFfmpeg(
      config,
      command =>
        command
          .input(gifPath)
          // Equivalent to -vf
          // This tells to output a gif palette
          .videoFilter(`palettegen=stats_mode=diff`)
          // Override any existing file
          .outputOptions([`-y`]),
      palettePath
    );

    // Optimize the gif quality using the palette
    // Must use .input() to ensure inputs are in the right order
    // https://superuser.com/questions/1199833/ffmpeg-palettegen-spits-out-a-palette-paletteuse-cant-use
    await runFfmpeg(
      config,
      command =>
        command
          .input(gifPath)
          .input(palettePath)
          // Equivalient to -lavi or -filter_complex
          .complexFilter(
            // Scale the gif
            `scale=w=${maxGifSize}:h=${maxGifSize}` +
              // Maintain the aspect ratio from the previous scale, and decrease whichever breaks it
              `:force_original_aspect_ratio=decrease` +
              // Other cool gif optimization stuff, see linked blog post
              `:flags=lanczos` +
              ` [x]; [x][1:v] paletteuse=dither=sierra2_4a`
          )
          // Set the format to gif, and override any existing file
          .outputOptions([`-f gif`, `-y`]),
      partialGifPath
    );

    // Only a finished gif gets the cached name
    await fs.move(partialGifPath, optimizedGifPath, { overwrite: true });
  } finally {
    await fs.remove(palettePath);
    await fs.remove(partialGifPath);
  }

  return optimizedGifPath;
};

module.exports = {
  getOptimizedGif: getOptimizedGif
};
