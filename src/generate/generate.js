// Require our dependencies
const chalk = require('chalk');
const crypto = require('crypto');
const fs = require('fs-extra');
const upath = require('upath');

module.exports = projectName => {
  // Add a default project name if none
  if (!projectName) {
    projectName = 'live-stream-radio';
  }

  // Inform user of project creation
  console.log('🎵', chalk.green('Generating a new pi-stream-radio project in:'), chalk.blue(projectName), '🎵');

  // Create our new project directory, relative to where we are or absolute
  const newProjectPath = upath.resolve(process.cwd(), projectName);
  if (fs.existsSync(newProjectPath)) {
    console.log(chalk.red(`${newProjectPath} already exists, please pick a new project name.`), '😞');
    process.exit(1);
  }

  // Fill the project diretory with the template
  console.log('📁', chalk.magenta(`Copying the template to ${newProjectPath} ...`));
  fs.copySync(upath.join(__dirname, 'template'), newProjectPath);

  // Every project gets its own api key, rather than one everyone knows
  const configPath = upath.join(newProjectPath, 'config.json');
  const config = fs.readJsonSync(configPath);
  config.api.key = crypto.randomBytes(24).toString('hex');
  fs.writeJsonSync(configPath, config, { spaces: 2 });
  console.log('🔑', chalk.magenta(`Generated a random api key, it is api.key in ${configPath}`));

  console.log(chalk.green(`Project created at: ${newProjectPath} !`), '🎉');
};
