// Interactive command to add a web console user, or change their password
const chalk = require('chalk');
const fs = require('fs');
const readline = require('readline');
const upath = require('upath');
const editJsonFile = require('edit-json-file');

const usersService = require('./api/users');

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
  const configPath = upath.join(process.cwd(), projectDirectory || '', 'config.json');
  if (!fs.existsSync(configPath)) {
    console.log(`${chalk.red('Error did not find a config.json at:')} ${configPath} 😞`);
    process.exit(1);
  }

  console.log(`${chalk.magenta('Adding a web console user to:')} ${configPath}`);

  const username = (await ask('Username: ')).trim();
  if (!username) {
    console.log(chalk.red('A username is required.'));
    process.exit(1);
  }

  const password = await ask('Password: ', true);
  if (password.length < 10) {
    console.log(chalk.red('Please use a password of at least 10 characters.'));
    process.exit(1);
  }
  const confirmPassword = await ask('Password again: ', true);
  if (password !== confirmPassword) {
    console.log(chalk.red('The passwords did not match.'));
    process.exit(1);
  }

  const configFile = editJsonFile(configPath);
  const users = (configFile.get('console.users') || []).filter(user => user && user.username !== username);
  const isNewUser = users.length === (configFile.get('console.users') || []).length;
  users.push({ username: username, password_hash: await usersService.hashPassword(password) });
  configFile.set('console.users', users);
  configFile.save();

  console.log(chalk.green(isNewUser ? `Added console user "${username}".` : `Changed the password for "${username}".`));
  console.log('Restarting is not needed, it is used on the next login.');
  process.exit(0);
};
