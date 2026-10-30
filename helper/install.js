#!/usr/bin/env node
'use strict';
// Registers the AutoPrompter native messaging host for one Chromium browser on
// macOS and records where the Cursor CLI lives.
//
//   node helper/install.js [--browser chrome|brave|edge|chromium] [--uninstall]
//                          [--extension-id ID] [--cursor-bin /path/to/agent]

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const lib = require('./lib');

const BROWSER_DIRS = {
  chrome: 'Google/Chrome',
  brave: 'BraveSoftware/Brave-Browser',
  edge: 'Microsoft Edge',
  chromium: 'Chromium',
};

function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 ? process.argv[i + 1] : null;
}

function findCursor(explicit) {
  const dirs = (process.env.PATH || '').split(':').concat([
    path.join(os.homedir(), '.local/bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ]);
  const names = explicit ? [explicit] : ['agent', 'cursor-agent'];
  for (const n of names) {
    const candidates = n.includes('/') ? [n] : dirs.map((d) => path.join(d, n));
    for (const c of candidates) {
      try {
        fs.accessSync(c, fs.constants.X_OK);
        execFileSync(c, ['--version'], { stdio: 'ignore', timeout: 15000 });
        return c;
      } catch (_) {
        /* keep looking */
      }
    }
  }
  return null;
}

function main() {
  const browser = arg('browser') || 'chrome';
  if (!BROWSER_DIRS[browser]) {
    console.error('Unknown browser. Use one of: ' + Object.keys(BROWSER_DIRS).join(', '));
    process.exit(1);
  }
  const manifestDir = path.join(os.homedir(), 'Library/Application Support', BROWSER_DIRS[browser], 'NativeMessagingHosts');
  const manifestFile = path.join(manifestDir, lib.HOST_NAME + '.json');
  const homeDir = path.join(os.homedir(), '.promptrelay');

  if (process.argv.includes('--uninstall')) {
    fs.rmSync(manifestFile, { force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
    console.log('Removed ' + manifestFile + ' and ' + homeDir);
    return;
  }

  const extManifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  const extId = arg('extension-id') || (extManifest.key && lib.extensionIdFromKey(extManifest.key));
  if (!extId) {
    console.error('No extension ID. Pass --extension-id.');
    process.exit(1);
  }

  const cursorBin = findCursor(arg('cursor-bin'));
  fs.mkdirSync(homeDir, { recursive: true });
  fs.writeFileSync(path.join(homeDir, 'config.json'), JSON.stringify({ cursorBin }, null, 2));

  // Chrome starts hosts with a minimal environment, so the wrapper pins the
  // exact node binary used to run this installer.
  const wrapper = path.join(homeDir, 'host');
  fs.writeFileSync(wrapper, '#!/bin/sh\nexec "' + process.execPath + '" "' + path.join(__dirname, 'host.js') + '"\n', { mode: 0o755 });
  fs.chmodSync(wrapper, 0o755);

  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(
    manifestFile,
    JSON.stringify(
      {
        name: lib.HOST_NAME,
        description: 'AutoPrompter helper: runs the Cursor CLI as a second prompt reviewer',
        path: wrapper,
        type: 'stdio',
        allowed_origins: ['chrome-extension://' + extId + '/'],
      },
      null,
      2
    )
  );

  console.log('Installed for ' + browser + '.');
  console.log('  Host manifest: ' + manifestFile);
  console.log('  Extension ID:  ' + extId);
  console.log(cursorBin ? '  Cursor CLI:    ' + cursorBin : '  Cursor CLI:    NOT FOUND. Install it, then run this again.');
  console.log('Reload the extension in your browser, then use "Test Cursor helper" in AutoPrompter settings.');
}

main();
