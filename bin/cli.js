#! /usr/bin/env node

const {execSync} = require ('child_process');

const runCommand = command => {
  try {
    execSync(`${command}`, {stdio: 'inherit'});
  } catch (e) {
    console.error(`failed to execute ${command}`, e);
    return false;
  }
  return true;
}

const repoName = process.argv[2];
const gitCheckoutCommand = `git clone --depth 1 https://github.com/kinitroConsultoria/create-node-express-es6-app ${repoName}`;
const installDepsCommand = `cd ${repoName} && npm install`;

console.log(`Clonning the repository with name ${repoName}`);
const checkedOut = runCommand(gitCheckoutCommand);
if (!checkedOut) process.exit(1);
console.log(`Installing dependencies for ${repoName}`);
const installedDeps = runCommand(installDepsCommand)
if (!installedDeps) process.exit(1);

console.log(`cd ${repoName} && npm start`)
