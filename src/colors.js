// Terminal colors, using Node's built-in util.styleText.
// Colors are left out when the output isn't a terminal (e.g. under systemd) or NO_COLOR is set.
const util = require('util');

const color = format => text => util.styleText(format, String(text));

module.exports = {
  red: color('red'),
  green: color('green'),
  blue: color('blue'),
  magenta: color('magenta'),
  yellow: color('yellow'),
  white: color('white'),
  // Print a divider across the terminal
  line: format => {
    console.log(util.styleText(format, '━'.repeat(Math.min(process.stdout.columns || 80, 120))));
  }
};
