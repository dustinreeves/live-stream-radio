#!/usr/bin/env node

// Parse our input
const argv = require('minimist')(process.argv.slice(2), {
  string: ['help', 'generate', 'output', 'start', 'set-password'],
  alias: {
    h: ['help'],
    v: ['version'],
    g: ['generate'],
    o: ['output'],
    s: ['start']
  }
});

// Check if we should print our usage
if ((Object.keys(argv).length === 1 && argv._.length <= 0) || argv.help !== undefined) {
  const colors = require('./colors');
  const pkg = require('../package.json');

  console.log(`
${colors.blue('USAGE:')} ${colors.yellow(pkg.name)}
  
  ${colors.blue('--help, -h')} : Print this usage message.
  ${colors.blue('--version, -v')} : Print the current version of this installation.
  ${colors.blue('--generate, -g')} ${colors.magenta('[Project Name/Directory]')} : Generate a new stream project,
    in a directory with the Project name.
  ${colors.blue('--output, -o')} ${colors.magenta('[Stream Output Location]')} : Override the 'stream_url/stream_key', 
    in the config.json, and output to the location. 
    Helpful for testing output and development.
  ${colors.blue('--start, -s')} ${colors.magenta('[Project Name/Directory]')} : Start the stream using the passed directory.
  ${colors.blue('--set-password')} ${colors.magenta('[Project Name/Directory]')} : Add a web console user, or change
    their password, in the project's config.json.
  ${colors.yellow('Default:')}
  Will assume the --start flag if no flag is passed.
  E.g 
  
  ${pkg.name} [Project Name/Directory]
  Will Become:
  ${pkg.name} --start [Project Name/Directory]
  `);

  process.exit(0);
}

// Check if we would like to print the installed version
if (argv.version !== undefined) {
  const jsonPackage = require('../package.json');
  console.log(jsonPackage.version);
  process.exit(0);
}

// Check if we would like to generate a project
if (argv.generate !== undefined) {
  // Call the generate from generator
  require('./generate/generate')(argv.generate);
  process.exit(0);
}

// Check if we would like to add a web console user
if (argv['set-password'] !== undefined) {
  require('./setPassword')(argv['set-password']).catch(e => {
    console.log(`Could not add the console user: ${e.message}`);
    process.exit(1);
  });
  return;
}

// Start the server
const fs = require('fs');
const nodePath = require('path');
const colors = require('./colors');

const historyService = require('./history.service');
const authService = require('./api/auth');
const { isEnabled } = require('./configValues');

// Keep recent output in memory for the web console's log view
require('./status.service').captureConsole();

// Check if we passed in a base path, relative to where we are or absolute
let path = nodePath.resolve(process.cwd(), (argv.start && argv.start.length > 0 && argv.start) || argv._[0] || '.');

// Add a trailing slash to out path if there isn't one
if (!path.endsWith(nodePath.sep)) {
  path += nodePath.sep;
}

// Keep using the last config that loaded, if an edit breaks it, rather than stopping the station
let lastGoodConfig = undefined;
const useConfig = (config, source) => {
  if (!config || typeof config !== 'object' || !config.api || typeof config.api !== 'object') {
    throw new Error(`The ${source} must be an object with an "api" section`);
  }
  lastGoodConfig = config;
  return config;
};
const configFailed = (message, e) => {
  console.log(`${colors.red(message)} 😞`);
  console.log(e.message);
  if (!lastGoodConfig) {
    process.exit(1);
  }
  console.log(colors.yellow('Using the last config that worked until it is fixed.'));
  return lastGoodConfig;
};

// Find if we have a config in the path
const configJsonPath = `${path}config.json`;
const configJsPath = `${path}config.js`;
let getConfig = undefined;
// First check if we have a config.js
if (fs.existsSync(configJsPath)) {
  console.log(`${colors.green('Using the config.js at:')} ${configJsPath}`);
  const configExport = require(configJsPath);

  // Wrap get config in all of our stateful service
  getConfig = async () => {
    try {
      return useConfig(
        await configExport(path, {
          history: historyService.getHistory()
        }),
        'config.js result'
      );
    } catch (e) {
      return configFailed('error calling the config.js!', e);
    }
  };
} else if (fs.existsSync(configJsonPath)) {
  console.log(`${colors.magenta('Using the config.json at:')} ${configJsonPath}`);
  // Simply set our config to a function that just returns the static config.json
  getConfig = async () => {
    try {
      // Drop the cached copy so edits to config.json (from the api or by hand) are picked up
      delete require.cache[require.resolve(configJsonPath)];
      return useConfig(require(configJsonPath), 'config.json');
    } catch (e) {
      return configFailed('error reading the config.json!', e);
    }
  };
} else {
  // Tell them could not find a config file
  console.log(`${colors.red('Error did not find a config.json at:')} ${configJsonPath} 😞`);
  process.exit(1);
}

const isLoopbackHost = host => {
  return !host || ['localhost', '127.0.0.1', '::1'].indexOf(String(host)) !== -1;
};

// The generated template used to ship the same api key for everyone. Don't let a stream
// that can be reached from other computers run with it
const checkApiKey = config => {
  if (!authService.usesDefaultApiKey(config)) {
    return;
  }

  if (!isLoopbackHost(config.api.host) || isEnabled(config.api.trust_proxy)) {
    console.log(`${colors.red('api.key in your config.json is still the example key "super-secret-api-key".')} 😟`);
    console.log('Anyone could control the stream with it. Change it (or remove it and add a console user) and start again.');
    process.exit(1);
  }

  console.log(
    colors.yellow('api.key in your config.json is still the example key. Change it before making the api reachable from other computers.')
  );
};

// Async task to start the radio
const startRadioTask = async () => {
  // Define our stream
  let stream = require('./stream/index.js');

  const config = await getConfig();
  checkApiKey(config);

  // Start the api
  const api = require('./api/index.js');
  await api.start(path, getConfig, stream);

  // Set our number of history items
  historyService.setNumberOfHistoryItems(config.api.number_of_history_items);

  // Start our stream
  await stream.start(path, getConfig, argv.output);
};
startRadioTask().catch(e => {
  console.log(`${colors.red('Could not start live-stream-radio:')} ${e.message} 😞`);
  process.exit(1);
});
