// End to end: runs the real host over the native messaging protocol against a
// fake Cursor binary, and checks what the binary was actually given.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const L = require('../helper/lib');

const HOST = path.join(__dirname, '..', 'helper', 'host.js');

function setup(fakeBody) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-test-'));
  const bin = path.join(dir, 'agent');
  fs.writeFileSync(bin, fakeBody.replace(/__DIR__/g, dir), { mode: 0o755 });
  const cfg = path.join(dir, 'config.json');
  fs.writeFileSync(cfg, JSON.stringify({ cursorBin: bin }));
  return { dir, cfg };
}

function callHost(cfg, req, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [HOST], { env: { ...process.env, PROMPTRELAY_CONFIG: cfg, ...env } });
    let out = Buffer.alloc(0);
    child.stdout.on('data', (d) => (out = Buffer.concat([out, d])));
    child.on('close', () => {
      try {
        resolve(L.tryDecodeFrame(out).message);
      } catch (e) {
        reject(new Error('bad reply frame: ' + out.toString()));
      }
    });
    child.stdin.write(L.encodeFrame(req));
  });
}

const GOOD = JSON.stringify({ is_coding: true, redesigned_prompt: 'Goal: X.', issues: ['gap'], changes: ['c'], assumptions: [] });
const FAKE_OK = `#!/bin/sh
case "$1" in --version) echo "9.9.9"; exit 0;; status) echo "Logged in as test"; exit 0;; esac
pwd > "__DIR__/cwd.txt"
ls -A . | wc -l > "__DIR__/cwdcount.txt"
printf '%s\\n' "$@" > "__DIR__/args.txt"
echo 'PROMPTRELAY_JSON_START'
echo '${GOOD}'
echo 'PROMPTRELAY_JSON_END'
`;

test('review runs Cursor in an empty temp dir with safe flags and cleans up', async () => {
  const { dir, cfg } = setup(FAKE_OK);
  const res = await callHost(cfg, { type: 'review', original: 'make a retry helper', improved: 'Write a retry helper.' });
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  assert.strictEqual(res.redesigned, 'Goal: X.');
  const args = fs.readFileSync(path.join(dir, 'args.txt'), 'utf8');
  assert.ok(args.includes('--mode\nask') && args.includes('--sandbox\nenabled'));
  assert.ok(!/--force|--yolo/.test(args));
  assert.ok(args.includes('make a retry helper') && args.includes('Write a retry helper.'));
  assert.strictEqual(fs.readFileSync(path.join(dir, 'cwdcount.txt'), 'utf8').trim(), '0');
  const cwd = fs.readFileSync(path.join(dir, 'cwd.txt'), 'utf8').trim();
  assert.ok(path.basename(cwd).startsWith('promptrelay-'));
  assert.ok(!fs.existsSync(cwd), 'temp workspace was not removed');
});

test('ping reports version and login state', async () => {
  const { cfg } = setup(FAKE_OK);
  const res = await callHost(cfg, { type: 'ping' });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.version, '9.9.9');
  assert.strictEqual(res.loggedIn, true);
});

test('missing Cursor binary gives a clear error', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-test-'));
  const cfg = path.join(dir, 'config.json');
  fs.writeFileSync(cfg, JSON.stringify({ cursorBin: null }));
  const res = await callHost(cfg, { type: 'review', original: 'a', improved: 'b' });
  assert.strictEqual(res.code, 'no_cursor');
});

test('login failure from Cursor suggests how to sign in', async () => {
  const { cfg } = setup('#!/bin/sh\necho "Error: not logged in, please login" 1>&2\nexit 1\n');
  const res = await callHost(cfg, { type: 'review', original: 'a', improved: 'b' });
  assert.strictEqual(res.code, 'cursor_failed');
  assert.ok(res.message.includes('agent login'));
});

test('a hung Cursor is killed at the timeout', async () => {
  const { cfg } = setup('#!/bin/sh\nsleep 30\n');
  const res = await callHost(cfg, { type: 'review', original: 'a', improved: 'b' }, { PROMPTRELAY_TIMEOUT_MS: '300' });
  assert.strictEqual(res.code, 'timeout');
});

test('unreadable Cursor output and bad requests are errors', async () => {
  const { cfg } = setup('#!/bin/sh\necho "I refuse"\n');
  assert.strictEqual((await callHost(cfg, { type: 'review', original: 'a', improved: 'b' })).code, 'bad_output');
  assert.strictEqual((await callHost(cfg, { type: 'review', original: 'a' })).code, 'bad_request');
  assert.strictEqual((await callHost(cfg, { type: 'nope' })).code, 'unknown');
});
