// Helpers for reading config values that may have been written as strings,
// e.g. "enabled": "false" in a hand edited config.json
const nodePath = require('path');

// True for true / "true" / 1 / "1" / "yes" / "on", false for anything else
const isEnabled = value => {
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'on'].indexOf(value.trim().toLowerCase()) !== -1;
  }
  return Boolean(value);
};

// A path from the config, relative to the project folder unless it's absolute
const projectPath = (path, configPath) => {
  return nodePath.resolve(path, configPath || '.');
};

module.exports = {
  isEnabled: isEnabled,
  projectPath: projectPath
};
