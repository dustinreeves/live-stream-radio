// Require our dependencies
const colors = require('../colors');
const crypto = require('crypto');
const fs = require('fs-extra');
const nodePath = require('path');

module.exports = projectName => {
  // Add a default project name if none
  if (!projectName) {
    projectName = 'live-stream-radio';
  }

  // Inform user of project creation
  console.log('🎵', colors.green('Generating a new pi-stream-radio project in:'), colors.blue(projectName), '🎵');

  // Create our new project directory, relative to where we are or absolute
  const newProjectPath = nodePath.resolve(process.cwd(), projectName);
  if (fs.existsSync(newProjectPath)) {
    console.log(colors.red(`${newProjectPath} already exists, please pick a new project name.`), '😞');
    process.exit(1);
  }

  // Fill the project diretory with the template
  console.log('📁', colors.magenta(`Copying the template to ${newProjectPath} ...`));
  fs.copySync(nodePath.join(__dirname, 'template'), newProjectPath);

  // Every project gets its own api key, rather than one everyone knows
  const configPath = nodePath.join(newProjectPath, 'config.json');
  const config = fs.readJsonSync(configPath);
  config.api.key = crypto.randomBytes(24).toString('hex');
  fs.writeJsonSync(configPath, config, { spaces: 2 });
  console.log('🔑', colors.magenta(`Generated a random api key, it is api.key in ${configPath}`));

  console.log(colors.green(`Project created at: ${newProjectPath} !`), '🎉');
};
