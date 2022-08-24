#! /usr/bin/env node

'use strict';

const https = require('https');
const chalk = require('chalk');
const commander = require('commander');
const execSync = require('child_process').execSync;
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const semver = require('semver');
const spawn = require('cross-spawn');
const validateProjectName = require('validate-npm-package-name');

const packageJson = require('./package.json');

let projectName;

function init() {
  const program = new commander.Command(packageJson.name)
    .version(packageJson.version)
    .arguments('<project-directory>')
    .usage(`${chalk.green('<project-directory>')} [options]`)
    .action(name => {
      projectName = name;
    })
    .parse(process.argv);

  if (typeof projectName === 'undefined') {
    console.error('Please specify the project directory:');
    console.log( `  ${chalk.cyan(program.name())} ${chalk.green('<project-directory>')}` );
    console.log();
    console.log('For example:');
    console.log( `  ${chalk.cyan(program.name())} ${chalk.green('my-node-express-es6-app')}` );
    console.log();
    process.exit(1);
  }

  // We first check the registry directly via the API, and if that fails, we try
  // the slower `npm view [package] version` command.
  //
  // This is important for users in environments where direct access to npm is
  // blocked by a firewall, and packages are provided exclusively via a private
  // registry.
  checkForLatestVersion()
    .catch(() => {
      try {
        return execSync('npm view create-node-express-es6-app version').toString().trim();
      } catch (e) {
        return null;
      }
    })
    .then(latest => {
      if (latest && semver.lt(packageJson.version, latest)) {
        console.log();
        console.error(
          chalk.yellow(
            `You are running \`create-node-express-es6-app\` ${packageJson.version}, which is behind the latest release (${latest}).\n\n` +
            'We recommend always using the latest version of create-node-express-es6-app if possible.'
          )
        );
        console.log();
      }

      createApp(
        projectName,
      );

    });
}

function createApp(name) {

  const root = path.resolve(name);
  const appName = path.basename(root);

  checkAppName(appName);
  fs.ensureDirSync(name);
  if (!isSafeToCreateProjectIn(root, name)) {
    process.exit(1);
  }
  console.log();
  console.log(`Creating a new app in ${chalk.green(root)}.`);
  console.log();

  const packageJson = {
    name: appName,
    version: '0.1.0',
    private: true,
  };
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(packageJson, null, 2) + os.EOL
  );

  const originalDirectory = process.cwd();
  process.chdir(root);
  if (!checkThatNpmCanReadCwd()) {
    process.exit(1);
  }

  run(
    root,
    appName,
    version,
    originalDirectory,
  );
}

function install(dependencies) {
  return new Promise((resolve, reject) => {
    let command = 'npm';
    let args;

    args = [
      'install',
      '--no-audit',
      '--save',
      '--save-exact',
      '--loglevel',
      'error',
    ].concat(dependencies);

    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('close', code => {
      if (code !== 0) {
        reject({
          command: `${command} ${args.join(' ')}`,
        });
        return;
      }
      resolve();
    });
  });
}

function run( root, appName ) {
  Promise.all(() => {
    const allDependencies = ['express', 'node-fetch'];

    console.log('Installing packages. This might take a couple of minutes.');
    console.log( `Installing ${chalk.cyan('express')}, ${chalk.cyan('node-fetch')}` );
    console.log();
    return install(allDependencies);

  })
  .catch(reason => {
    console.log();
    console.log('Aborting installation.');
    if (reason.command) {
      console.log(`  ${chalk.cyan(reason.command)} has failed.`);
    } else {
      console.log( chalk.red('Unexpected error. Please report it as a bug:') );
      console.log(reason);
    }
    console.log();

    // On 'exit' we will delete these files from target directory.
    const knownGeneratedFiles = ['package.json', 'node_modules'];
    const currentFiles = fs.readdirSync(path.join(root));
    currentFiles.forEach(file => {
      knownGeneratedFiles.forEach(fileToMatch => {
        // This removes all knownGeneratedFiles.
        if (file === fileToMatch) {
          console.log(`Deleting generated file... ${chalk.cyan(file)}`);
          fs.removeSync(path.join(root, file));
        }
      });
    });
    const remainingFiles = fs.readdirSync(path.join(root));
    if (!remainingFiles.length) {
      // Delete target folder if empty
      console.log( `Deleting ${chalk.cyan(`${appName}/`)} from ${chalk.cyan(path.resolve(root, '..') )}` );
      process.chdir(path.resolve(root, '..'));
      fs.removeSync(path.join(root));
    }
    console.log('Done.');
    process.exit(1);
  });
}

function checkAppName(appName) {
  const validationResult = validateProjectName(appName);
  if (!validationResult.validForNewPackages) {
    console.error(
      chalk.red( `Cannot create a project named ${chalk.green( `"${appName}"` )} because of npm naming restrictions:\n` )
    );
    [
      ...(validationResult.errors || []),
      ...(validationResult.warnings || []),
    ].forEach(error => {
      console.error(chalk.red(`  * ${error}`));
    });
    console.error(chalk.red('\nPlease choose a different project name.'));
    process.exit(1);
  }

  const dependencies = ['express', 'node-fetch'].sort();
  if (dependencies.includes(appName)) {
    console.error(
      chalk.red(
        `Cannot create a project named ${chalk.green( `"${appName}"` )} because a dependency with the same name exists.\n` +
        `Due to the way npm works, the following names are not allowed:\n\n`
      ) +
      chalk.cyan(dependencies.map(depName => `  ${depName}`).join('\n')) +
      chalk.red('\n\nPlease choose a different project name.')
    );
    process.exit(1);
  }
}

// If project only contains files generated by GH, it’s safe.
// Also, if project contains remnant error logs from a previous
// installation, lets remove them now.
// We also special case IJ-based products .idea because it integrates with CRA:
// https://github.com/facebook/create-react-app/pull/368#issuecomment-243446094
function isSafeToCreateProjectIn(root, name) {
  const validFiles = [
    '.DS_Store',
    '.git',
    '.gitattributes',
    '.gitignore',
    '.gitlab-ci.yml',
    '.hg',
    '.hgcheck',
    '.hgignore',
    '.idea',
    '.npmignore',
    '.travis.yml',
    'docs',
    'LICENSE',
    'README.md',
    'mkdocs.yml',
    'Thumbs.db',
  ];
  // These files should be allowed to remain on a failed install, but then
  // silently removed during the next create.
  const errorLogFilePatterns = [
    'npm-debug.log',
    'yarn-error.log',
    'yarn-debug.log',
  ];
  const isErrorLog = file => {
    return errorLogFilePatterns.some(pattern => file.startsWith(pattern));
  };

  const conflicts = fs
    .readdirSync(root)
    .filter(file => !validFiles.includes(file))
    // IntelliJ IDEA creates module files before CRA is launched
    .filter(file => !/\.iml$/.test(file))
    // Don't treat log files from previous installation as conflicts
    .filter(file => !isErrorLog(file));

  if (conflicts.length > 0) {
    console.log(
      `The directory ${chalk.green(name)} contains files that could conflict:`
    );
    console.log();
    for (const file of conflicts) {
      try {
        const stats = fs.lstatSync(path.join(root, file));
        if (stats.isDirectory()) {
          console.log(`  ${chalk.blue(`${file}/`)}`);
        } else {
          console.log(`  ${file}`);
        }
      } catch (e) {
        console.log(`  ${file}`);
      }
    }
    console.log();
    console.log(
      'Either try using a new directory name, or remove the files listed above.'
    );

    return false;
  }

  // Remove any log files from a previous installation.
  fs.readdirSync(root).forEach(file => {
    if (isErrorLog(file)) {
      fs.removeSync(path.join(root, file));
    }
  });
  return true;
}

// See https://github.com/facebook/create-react-app/pull/3355
function checkThatNpmCanReadCwd() {
  const cwd = process.cwd();
  let childOutput = null;
  try {
    // Note: intentionally using spawn over exec since
    // the problem doesn't reproduce otherwise.
    // `npm config list` is the only reliable way I could find
    // to reproduce the wrong path. Just printing process.cwd()
    // in a Node process was not enough.
    childOutput = spawn.sync('npm', ['config', 'list']).output.join('');
  } catch (err) {
    // Something went wrong spawning node.
    // Not great, but it means we can't do this check.
    // We might fail later on, but let's continue.
    return true;
  }
  if (typeof childOutput !== 'string') {
    return true;
  }
  const lines = childOutput.split('\n');
  // `npm config list` output includes the following line:
  // "; cwd = C:\path\to\current\dir" (unquoted)
  // I couldn't find an easier way to get it.
  const prefix = '; cwd = ';
  const line = lines.find(line => line.startsWith(prefix));
  if (typeof line !== 'string') {
    // Fail gracefully. They could remove it.
    return true;
  }
  const npmCWD = line.substring(prefix.length);
  if (npmCWD === cwd) {
    return true;
  }
  console.error(
    chalk.red(
      `Could not start an npm process in the right directory.\n\n` +
      `The current directory is: ${chalk.bold(cwd)}\n` +
      `However, a newly started npm process runs in: ${chalk.bold(
        npmCWD
      )}\n\n` +
      `This is probably caused by a misconfigured system terminal shell.`
    )
  );
  if (process.platform === 'win32') {
    console.error(
      chalk.red(`On Windows, this can usually be fixed by running:\n\n`) +
      `  ${chalk.cyan(
        'reg'
      )} delete "HKCU\\Software\\Microsoft\\Command Processor" /v AutoRun /f\n` +
      `  ${chalk.cyan(
        'reg'
      )} delete "HKLM\\Software\\Microsoft\\Command Processor" /v AutoRun /f\n\n` +
      chalk.red(`Try to run the above two lines in the terminal.\n`) +
      chalk.red(
        `To learn more about this problem, read: https://blogs.msdn.microsoft.com/oldnewthing/20071121-00/?p=24433/`
      )
    );
  }
  return false;
}

function checkForLatestVersion() {
  return new Promise((resolve, reject) => {
    https
      .get(
        'https://registry.npmjs.org/-/package/create-react-app/dist-tags',
        res => {
          if (res.statusCode === 200) {
            let body = '';
            res.on('data', data => (body += data));
            res.on('end', () => {
              resolve(JSON.parse(body).latest);
            });
          } else {
            reject();
          }
        }
      )
      .on('error', () => {
        reject();
      });
  });
}

module.exports = { init };