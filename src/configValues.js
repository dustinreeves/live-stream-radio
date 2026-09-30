// Helpers for reading config values that may have been written as strings,
// e.g. "enabled": "false" in a hand edited config.json

// True for true / "true" / 1 / "1" / "yes" / "on", false for anything else
const isEnabled = value => {
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'on'].indexOf(value.trim().toLowerCase()) !== -1;
  }
  return Boolean(value);
};

module.exports = {
  isEnabled: isEnabled
};
