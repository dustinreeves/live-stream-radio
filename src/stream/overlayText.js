// Overlay text for the stream
const fs = require('fs');
const os = require('os');
const nodePath = require('path');
const { isEnabled, projectPath } = require('../configValues');

// Quote a file path for use as a filter option. Forward slashes, and the drive letter colon
// escaped, so Windows paths like C:\radio\font.ttf work as well as Linux ones
const filterPath = filePath => {
  const escaped = nodePath.normalize(filePath).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\''");
  return `'${escaped}'`;
};

// The text is written to a file and read with textfile=, with expansion off, rather than
// escaped into the filter. Titles and tags can contain anything (apostrophes, colons, %),
// and escaping them into the filter reliably is not possible across ffmpeg versions.
// The file is read once when ffmpeg starts, so it's safe to overwrite for the next track.
const writeTextFile = (key, text) => {
  const textPath = nodePath.join(os.tmpdir(), `live-stream-radio-overlay-${process.pid}-${key}.txt`);
  fs.writeFileSync(textPath, text);
  return textPath;
};

// Build a drawtext filter for one Common Text Object
// Note: Positions and sizes are done relative to the input video width and height
// Therefore position x/y is a percentage, like CSS style.
// Font size is simply just a fraction of the width
const getDrawText = (key, itemObject, text, fontPath) => {
  let itemString =
    `drawtext=textfile=${filterPath(writeTextFile(key, text))}` +
    `:expansion=none` +
    `:fontfile=${filterPath(fontPath)}` +
    `:fontsize=(w * ${itemObject.font_size / 300})` +
    `:bordercolor=${itemObject.font_border}` +
    `:borderw=1` +
    `:fontcolor=${itemObject.font_color}` +
    `:y=(h * ${itemObject.position_y / 100})`;
  if (isEnabled(itemObject.enable_scroll)) {
    itemString += `:x=w-mod(max(t\\, 0) * (w + tw) / ${itemObject.font_scroll_speed}\\, (w + tw))`;
  } else {
    itemString += `:x=(w * ${itemObject.position_x / 100})`;
  }
  return itemString;
};

const getOverlayTextString = async (path, config, typeKey, metadata, audioPath) => {
  if (!config[typeKey].overlay || !isEnabled(config[typeKey].overlay.enabled)) {
    return '';
  }

  const overlayConfigObject = config[typeKey].overlay;
  const fontPath = projectPath(path, overlayConfigObject.font_path);
  const common = metadata.common || {};

  // Songs without a title tag (common for podcast episodes) show their file name instead
  let songTitle = common.title;
  if (!songTitle && audioPath) {
    songTitle = nodePath.basename(audioPath, nodePath.extname(audioPath));
  }

  // [config key, text to show]. Metadata lines are skipped when the file has no such tag,
  // rather than showing "Artist: undefined"
  const textItems = [
    ['title', overlayConfigObject.title && overlayConfigObject.title.text],
    ['artist', common.artist && `${overlayConfigObject.artist ? overlayConfigObject.artist.label || '' : ''}${common.artist}`],
    ['album', common.album && `${overlayConfigObject.album ? overlayConfigObject.album.label || '' : ''}${common.album}`],
    ['song', songTitle && `${overlayConfigObject.song ? overlayConfigObject.song.label || '' : ''}${songTitle}`]
  ];

  const overlayTextItems = [];
  textItems.forEach(([key, text]) => {
    const itemObject = overlayConfigObject[key];
    if (itemObject && isEnabled(itemObject.enabled) && text) {
      overlayTextItems.push(getDrawText(`${typeKey}-${key}`, itemObject, String(text), fontPath));
    }
  });

  // Add our video filter with all of our overlays
  return overlayTextItems.join(',');
};

module.exports = getOverlayTextString;
