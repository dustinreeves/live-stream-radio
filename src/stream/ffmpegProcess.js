// Runs ffmpeg. Progress comes from ffmpeg's -progress output (key=value lines on stdout),
// which is the same across ffmpeg versions, unlike its console output.
const { spawn } = require('child_process');

// Lines of ffmpeg's stderr kept for error messages
const MAX_STDERR_LINES = 100;

// Quote an argument for showing the command in the log
const quoteArgument = argument => {
  return /^[\w@%+=:,./\\-]+$/.test(argument) ? argument : `"${argument.replace(/"/g, '\\"')}"`;
};

// "00:01:02.500000" -> 62.5
const parseTime = time => {
  const parts = String(time).split(':');
  if (parts.length !== 3) {
    return undefined;
  }
  const seconds = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
  return isNaN(seconds) ? undefined : seconds;
};

// Split a stream into lines, calling onLine for each. Handles \r, \n and \r\n
const readLines = (stream, onLine) => {
  let partial = '';
  stream.setEncoding('utf8');
  stream.on('data', chunk => {
    const lines = (partial + chunk).split(/\r\n|\r|\n/);
    partial = lines.pop();
    lines.forEach(onLine);
  });
  stream.on('end', () => {
    if (partial) {
      onLine(partial);
    }
  });
};

// Start ffmpeg with args. handlers (all optional):
//   start(commandLine) once it's running, progress({ seconds, fps, kbps }),
//   end() when it finishes, error(err, stderr) if it can't start or fails
// Returns { process, commandLine, kill() }, kill resolves once ffmpeg has exited
const startFfmpeg = (ffmpegPath, args, handlers = {}) => {
  const command = ffmpegPath || 'ffmpeg';
  const fullArgs = ['-hide_banner', '-nostats', '-progress', 'pipe:1', ...args];
  const commandLine = [command, ...fullArgs].map(quoteArgument).join(' ');

  const stderrLines = [];
  let finished = false;
  const finish = (callback, ...callbackArgs) => {
    if (!finished) {
      finished = true;
      if (callback) {
        callback(...callbackArgs);
      }
    }
  };

  const child = spawn(command, fullArgs, { windowsHide: true });
  const exited = new Promise(resolve => {
    child.once('close', resolve);
    child.once('error', resolve);
  });

  child.once('spawn', () => {
    if (handlers.start) {
      handlers.start(commandLine);
    }
  });

  // -progress writes blocks of key=value lines, each ending with progress=continue / end
  let progress = {};
  readLines(child.stdout, line => {
    const separator = line.indexOf('=');
    if (separator === -1) {
      return;
    }
    const key = line.substr(0, separator).trim();
    const value = line.substr(separator + 1).trim();
    progress[key] = value;
    if (key === 'progress') {
      const seconds = parseTime(progress.out_time);
      if (handlers.progress && seconds !== undefined) {
        handlers.progress({
          seconds: seconds,
          fps: parseFloat(progress.fps) || 0,
          kbps: parseFloat(progress.bitrate) || 0
        });
      }
      progress = {};
    }
  });

  readLines(child.stderr, line => {
    stderrLines.push(line);
    if (stderrLines.length > MAX_STDERR_LINES) {
      stderrLines.shift();
    }
  });

  child.once('error', err => {
    finish(handlers.error, new Error(`Could not run ${command}: ${err.message}`), stderrLines.join('\n'));
  });

  child.once('close', (code, signal) => {
    if (code === 0) {
      finish(handlers.end);
    } else {
      const reason = signal ? `was killed with ${signal}` : `exited with code ${code}`;
      finish(handlers.error, new Error(`ffmpeg ${reason}`), stderrLines.join('\n'));
    }
  });

  return {
    process: child,
    commandLine: commandLine,
    kill: () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
      return exited;
    }
  };
};

// Run ffmpeg to the end, resolves when it succeeds and rejects with its error output when it fails
const runFfmpeg = (ffmpegPath, args) => {
  return new Promise((resolve, reject) => {
    startFfmpeg(ffmpegPath, args, {
      end: resolve,
      error: (err, stderr) => {
        const lastLines = stderr.split('\n').slice(-5).join('\n');
        reject(new Error(`${err.message}\n${lastLines}`));
      }
    });
  });
};

module.exports = {
  startFfmpeg: startFfmpeg,
  runFfmpeg: runFfmpeg,
  parseTime: parseTime
};
