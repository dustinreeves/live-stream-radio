// Interactive command to add a web console user, or change their password
const colors = require('./colors');
const fs = require('fs');
const readline = require('readline');
const nodePath = require('path');

const usersService = require('./api/users');
const configFile = require('./configFile');

// Ask a question on the terminal, optionally without echoing what is typed
const ask = (question, hidden) => {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = text => {
        // Still show the question and the final newline, just not the typed characters
        if (text.indexOf(question) !== -1 || text === '\r\n' || text === '\n') {
          rl.output.write(text);
        }
      };
    }
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
};

module.exports = async projectDirectory => {
  const configPath = nodePath.join(nodePath.resolve(process.cwd(), projectDirectory || '.'), 'config.json');
  if (!fs.existsSync(configPath)) {
    console.log(`${colors.red('Error did not find a config.json at:')} ${configPath} 😞`);
    process.exit(1);
  }

  console.log(`${colors.magenta('Adding a web console user to:')} ${configPath}`);

  const username = (await ask('Username: ')).trim();
  if (!username) {
    console.log(colors.red('A username is required.'));
    process.exit(1);
  }

  const password = await ask('Password: ', true);
  if (password.length < 10) {
    console.log(colors.red('Please use a password of at least 10 characters.'));
    process.exit(1);
  }
  const confirmPassword = await ask('Password again: ', true);
  if (password !== confirmPassword) {
    console.log(colors.red('The passwords did not match.'));
    process.exit(1);
  }

  const config = await configFile.readConfig(configPath);
  const existingUsers = configFile.getValue(config, 'console.users');
  const currentUsers = Array.isArray(existingUsers) ? existingUsers : [];
  const users = currentUsers.filter(user => user && user.username !== username);
  const isNewUser = users.length === currentUsers.length;
  users.push({ username: username, password_hash: await usersService.hashPassword(password) });
  configFile.setValue(config, 'console.users', users);
  await configFile.writeConfig(configPath, config);

  console.log(colors.green(isNewUser ? `Added console user "${username}".` : `Changed the password for "${username}".`));
  console.log('Restarting is not needed, it is used on the next login.');
  process.exit(0);
};
