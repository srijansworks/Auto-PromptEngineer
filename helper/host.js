#!/usr/bin/env node
'use strict';
// Native messaging host. Chrome starts one process per message, so this reads
// one request, answers once, and exits. Nothing but the reply frame may ever be
// written to stdout.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const lib = require('./lib');

const TIMEOUT_MS = Number(process.env.PROMPTRELAY_TIMEOUT_MS) || 120000;
const MAX_OUTPUT_BYTES = 400 * 1024;

function configPath() {
  return process.env.PROMPTRELAY_CONFIG || path.join(os.homedir(), '.promptrelay', 'config.json');
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch (_) {
    return {};
  }
}

function run(bin, args, cwd) {
  return new Promise((resolve) => {
    const dirs = [path.dirname(bin), path.dirname(process.execPath), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];
    const child = spawn(bin, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: dirs.join(':') },
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const kill = () => child.kill('SIGKILL');
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, TIMEOUT_MS);
    child.stdout.on('data', (d) => {
      stdout += d;
      if (stdout.length > MAX_OUTPUT_BYTES) kill();
    });
    child.stderr.on('data', (d) => {
      if (stderr.length < 4000) stderr += d;
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: String(e.message), timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

function cursorBin() {
  const bin = loadConfig().cursorBin;
  if (!bin) return null;
  try {
    fs.accessSync(bin, fs.constants.X_OK);
    return bin;
  } catch (_) {
    return null;
  }
}

const NO_CURSOR = {
  ok: false,
  code: 'no_cursor',
  message: 'The Cursor CLI was not found. Install it, then run helper/install.js again.',
};

async function ping() {
  const bin = cursorBin();
  if (!bin) return NO_CURSOR;
  const v = await run(bin, ['--version'], os.tmpdir());
  if (v.code !== 0) return { ok: false, code: 'cursor_failed', message: 'The Cursor CLI did not start.' };
  const s = await run(bin, ['status'], os.tmpdir());
  return {
    ok: true,
    version: v.stdout.trim().slice(0, 60),
    loggedIn: s.code === 0,
    status: (s.stdout || s.stderr).trim().slice(0, 200),
  };
}

async function review(req) {
  const problem = lib.validateReviewRequest(req);
  if (problem) return { ok: false, code: 'bad_request', message: problem };
  const bin = cursorBin();
  if (!bin) return NO_CURSOR;

  const nonce = crypto.randomBytes(6).toString('hex');
  const prompt = lib.buildCursorPrompt(req.original, req.improved, nonce);
  // A fresh, empty directory: Cursor has nothing of yours to read.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptrelay-'));
  try {
    const r = await run(bin, lib.buildArgs(prompt, dir), dir);
    if (r.timedOut) return { ok: false, code: 'timeout', message: 'Cursor did not answer in time.' };
    if (r.code !== 0) {
      const hint = /login|log in|auth|api key|unauthor/i.test(r.stderr + r.stdout)
        ? ' Run "agent login" in a terminal, or set CURSOR_API_KEY.'
        : '';
      return { ok: false, code: 'cursor_failed', message: 'Cursor returned an error.' + hint };
    }
    return lib.parseCursorOutput(r.stdout);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function handle(req) {
  if (req && req.type === 'ping') return ping();
  if (req && req.type === 'review') return review(req);
  return { ok: false, code: 'unknown', message: 'Unknown request.' };
}

function readOneFrame(stream) {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    stream.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      try {
        const frame = lib.tryDecodeFrame(buf);
        if (frame) resolve(frame.message);
      } catch (e) {
        reject(e);
      }
    });
    stream.on('end', () => reject(new Error('input closed')));
  });
}

async function main() {
  let res;
  try {
    res = await handle(await readOneFrame(process.stdin));
  } catch (_) {
    res = { ok: false, code: 'internal', message: 'The PromptRelay helper hit an internal error.' };
  }
  process.stdout.write(lib.encodeFrame(res), () => process.exit(0));
}

if (require.main === module) main();
module.exports = { handle };
