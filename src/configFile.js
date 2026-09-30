// Reading and changing config.json, with keys like "radio.overlay.enabled"
const fs = require('fs-extra');
const { isEnabled } = require('./configValues');
const { PLAY_ORDERS } = require('./playOrder.service');

// Never follow these, so a key can't reach Object.prototype
const UNSAFE_KEY_PARTS = ['__proto__', 'constructor', 'prototype'];

const isObject = value => {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
};

const splitKey = key => {
  const parts = String(key).split('.');
  if (parts.some(part => part.length === 0 || UNSAFE_KEY_PARTS.indexOf(part) !== -1)) {
    throw new Error(`"${key}" is not a valid config key`);
  }
  return parts;
};

// The value at key, or undefined if there is none
const getValue = (config, key) => {
  return splitKey(key).reduce((value, part) => {
    if (value !== null && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, part)) {
      return value[part];
    }
    return undefined;
  }, config);
};

// Set the value at key, creating the sections on the way
const setValue = (config, key, newValue) => {
  const parts = splitKey(key);
  let section = config;
  parts.slice(0, -1).forEach(part => {
    if (!Object.prototype.hasOwnProperty.call(section, part) || section[part] === null || typeof section[part] !== 'object') {
      section[part] = {};
    }
    section = section[part];
  });
  section[parts[parts.length - 1]] = newValue;
  return config;
};

// Returns why a config can't run the stream, or undefined if it looks fine
const findConfigProblem = config => {
  if (!isObject(config)) {
    return 'config must be a JSON object';
  }
  if (!isObject(config.api)) {
    return 'config must keep its "api" section, or the api would stop working';
  }

  const typeKeys = ['radio'];
  if (config.interlude && isEnabled(config.interlude.enabled)) {
    typeKeys.push('interlude');
  }
  for (let i = 0; i < typeKeys.length; i++) {
    const section = config[typeKeys[i]];
    if (!isObject(section) || typeof section.audio_directory !== 'string' || typeof section.video_directory !== 'string') {
      return `config needs a "${typeKeys[i]}" section with audio_directory and video_directory`;
    }
    if (section.play_order !== undefined && PLAY_ORDERS.indexOf(section.play_order) === -1) {
      return `${typeKeys[i]}.play_order must be one of ${PLAY_ORDERS.join(', ')}`;
    }
  }

  if (config.podcasts !== undefined) {
    if (!isObject(config.podcasts) || (config.podcasts.feeds !== undefined && !Array.isArray(config.podcasts.feeds))) {
      return 'podcasts must be an object, with feeds as a list';
    }
    const feeds = config.podcasts.feeds || [];
    for (let i = 0; i < feeds.length; i++) {
      const feed = typeof feeds[i] === 'string' ? { url: feeds[i] } : feeds[i];
      if (!isObject(feed) || typeof feed.url !== 'string' || !/^https?:\/\//i.test(feed.url)) {
        return `podcasts.feeds[${i}] needs a url starting with http:// or https://`;
      }
      if (feed.keep_latest !== undefined && !(parseInt(feed.keep_latest, 10) >= 0)) {
        return `podcasts.feeds[${i}].keep_latest must be 0 (keep every episode) or more`;
      }
    }
  }

  return undefined;
};

const readConfig = configPath => {
  return fs.readJson(configPath);
};

// Write to a temp file, then rename it over config.json, so config.json is never half written
const writeConfig = async (configPath, config) => {
  const tempPath = `${configPath}.${process.pid}.tmp`;
  await fs.writeJson(tempPath, config, { spaces: 2 });
  await fs.rename(tempPath, configPath);
};

module.exports = {
  getValue: getValue,
  setValue: setValue,
  findConfigProblem: findConfigProblem,
  readConfig: readConfig,
  writeConfig: writeConfig
};
