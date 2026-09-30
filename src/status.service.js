// Singleton service to store live stream status and recent log output,
// so the web console can show what is happening without shell access
const util = require('util');

const MAX_LOG_LINES = 500;

// Strip terminal color codes from chalk output
const ansiRegex = /\x1b\[[0-9;]*[A-Za-z]/g;

const logLines = [];
let nextLogId = 1;
let progress = undefined;
let isCapturing = false;

const addLogLine = text => {
  text
    .replace(ansiRegex, '')
    .split('\n')
    .forEach(line => {
      if (line.trim().length <= 0) {
        return;
      }
      logLines.push({ id: nextLogId++, date: Date.now(), text: line });
    });

  if (logLines.length > MAX_LOG_LINES) {
    logLines.splice(0, logLines.length - MAX_LOG_LINES);
  }
};

module.exports = {
  // Mirror everything written with console.log / console.error into our log buffer
  captureConsole: () => {
    if (isCapturing) {
      return;
    }
    isCapturing = true;

    ['log', 'error', 'warn'].forEach(method => {
      const original = console[method].bind(console);
      console[method] = (...args) => {
        try {
          addLogLine(util.format(...args));
        } catch (e) {
          // Never let logging break the stream
        }
        original(...args);
      };
    });
  },
  getLog: since => {
    if (since) {
      return logLines.filter(line => line.id > since);
    }
    return logLines;
  },
  setProgress: newProgress => {
    progress = {
      ...newProgress,
      date: Date.now()
    };
  },
  clearProgress: () => {
    progress = undefined;
  },
  getProgress: () => {
    return progress;
  }
};
