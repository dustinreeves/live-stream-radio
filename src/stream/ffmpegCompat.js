// Newer ffmpeg (6+) prints a third "device" column in `ffmpeg -formats`, e.g. " D d lavfi".
// fluent-ffmpeg 2.1.x can't parse those lines, so it thinks formats like lavfi (which we use
// for the silent audio input) don't exist and refuses to run. fluent-ffmpeg returns its cached
// format list by reference, so we add the missing entries to it once at startup.
const { execFile } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');

const deviceFormatRegexp = /^\s*([D ])([E ])d\s+(\S+)\s+(.*)$/;

let patched = false;

module.exports = config => {
  if (patched) {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    let command = ffmpeg();
    if (config.ffmpeg_path) {
      command = command.setFfmpegPath(config.ffmpeg_path);
    }

    command.getAvailableFormats((err, formats) => {
      if (err || !formats) {
        // Let fluent-ffmpeg report the real problem when the stream starts
        return resolve();
      }

      execFile(config.ffmpeg_path || 'ffmpeg', ['-hide_banner', '-formats'], { maxBuffer: 4 * 1024 * 1024 }, (execErr, stdout) => {
        if (!execErr) {
          String(stdout)
            .split(/\r\n|\r|\n/)
            .forEach(line => {
              const match = line.match(deviceFormatRegexp);
              if (!match) {
                return;
              }
              match[3].split(',').forEach(format => {
                if (!formats[format]) {
                  formats[format] = { description: match[4], canDemux: match[1] === 'D', canMux: match[2] === 'E' };
                }
              });
            });
        }
        patched = true;
        resolve();
      });
    });
  });
};
