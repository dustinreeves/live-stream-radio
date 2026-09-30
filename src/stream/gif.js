const crypto = require('crypto');
const fs = require('fs-extra');
const nodePath = require('path');
const os = require('os');
const { runFfmpeg } = require('./ffmpegProcess');

const DEFAULT_MAX_GIF_SIZE = 720;

// Converted gifs are kept here and reused, rather than converting the same gif for every track
const cacheDirectory = nodePath.join(os.tmpdir(), 'live-stream-radio-gifs');

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
  const optimizedGifPath = nodePath.join(cacheDirectory, `${cacheKey}.gif`);
  if (await fs.pathExists(optimizedGifPath)) {
    return optimizedGifPath;
  }

  await fs.ensureDir(cacheDirectory);
  const tempName = `${cacheKey}-${process.pid}-${Date.now()}`;
  const palettePath = nodePath.join(cacheDirectory, `${tempName}-palette.png`);
  const partialGifPath = nodePath.join(cacheDirectory, `${tempName}-partial.gif`);

  try {
    // Create the gif pallete using ffmpeg
    // palettegen tells ffmpeg to output a gif palette, -y overrides any existing file
    await runFfmpeg(config.ffmpeg_path, ['-i', gifPath, '-vf', 'palettegen=stats_mode=diff', '-y', palettePath]);

    // Optimize the gif quality using the palette
    // https://superuser.com/questions/1199833/ffmpeg-palettegen-spits-out-a-palette-paletteuse-cant-use
    const filter =
      // Scale the gif
      `scale=w=${maxGifSize}:h=${maxGifSize}` +
      // Maintain the aspect ratio from the previous scale, and decrease whichever breaks it
      `:force_original_aspect_ratio=decrease` +
      // Other cool gif optimization stuff, see linked blog post
      `:flags=lanczos` +
      ` [x]; [x][1:v] paletteuse=dither=sierra2_4a`;
    await runFfmpeg(config.ffmpeg_path, ['-i', gifPath, '-i', palettePath, '-filter_complex', filter, '-f', 'gif', '-y', partialGifPath]);

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
