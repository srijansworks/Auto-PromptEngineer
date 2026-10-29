const test = require('node:test');
const assert = require('node:assert');
const L = require('../helper/lib');

test('frames round trip, including split chunks and back to back frames', () => {
  const a = L.encodeFrame({ type: 'ping', text: 'héllo' });
  const b = L.encodeFrame({ n: 2 });
  assert.strictEqual(L.tryDecodeFrame(a.subarray(0, 3)), null);
  assert.strictEqual(L.tryDecodeFrame(a.subarray(0, a.length - 1)), null);
  const first = L.tryDecodeFrame(Buffer.concat([a, b]));
  assert.deepStrictEqual(first.message, { type: 'ping', text: 'héllo' });
  assert.deepStrictEqual(L.tryDecodeFrame(first.rest).message, { n: 2 });
});

test('oversize frame header is rejected before buffering', () => {
  const head = Buffer.alloc(4);
  head.writeUInt32LE(50 * 1024 * 1024, 0);
  assert.throws(() => L.tryDecodeFrame(head), /too large/);
});

test('cursor args are read-only by construction', () => {
  const args = L.buildArgs('PROMPT', '/tmp/x');
  for (const bad of L.FORBIDDEN_FLAGS) assert.ok(!args.includes(bad), bad);
  assert.ok(args.includes('-p') && args.includes('--sandbox'));
  assert.strictEqual(args[args.indexOf('--mode') + 1], 'ask');
  assert.strictEqual(args[args.indexOf('--sandbox') + 1], 'enabled');
  assert.strictEqual(args[args.indexOf('--workspace') + 1], '/tmp/x');
  assert.strictEqual(args[args.length - 1], 'PROMPT');
});

test('a prompt full of shell metacharacters stays one argv entry', () => {
  const evil = '$(rm -rf ~); `id` "quotes" \'single\' && echo hi';
  const args = L.buildArgs(L.buildCursorPrompt(evil, evil, 'n'), '/tmp/x');
  assert.ok(args[args.length - 1].includes(evil));
  assert.strictEqual(args.filter((a) => a.includes('rm -rf')).length, 1);
});

test('cursor prompt delimits both texts and tells Cursor not to touch anything', () => {
  const p = L.buildCursorPrompt('orig text', 'candidate text', 'abc');
  assert.ok(p.includes('BEGIN PROMPTRELAY_ORIGINAL_abc') && p.includes('END PROMPTRELAY_CANDIDATE_abc'));
  assert.ok(p.includes('Do not read, create, change or run anything'));
  assert.ok(p.includes('untrusted data'));
  assert.ok(!p.includes('\u2014'));
});

const reply = { is_coding: true, redesigned_prompt: 'Goal: add retries.', issues: ['No language given'], changes: ['Added checklist'], assumptions: [] };

test('parses marked, fenced and bare JSON', () => {
  const j = JSON.stringify(reply);
  for (const text of ['PROMPTRELAY_JSON_START\n' + j + '\nPROMPTRELAY_JSON_END', 'Sure:\n```json\n' + j + '\n```', 'noise ' + j + ' trailing']) {
    const r = L.parseCursorOutput(text);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.redesigned, 'Goal: add retries.');
    assert.deepStrictEqual(r.issues, ['No language given']);
  }
});

test('non coding result carries no redesign', () => {
  const r = L.parseCursorOutput(JSON.stringify({ is_coding: false, redesigned_prompt: 'ignored', issues: ['Not code'] }));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.isCoding, false);
  assert.strictEqual(r.redesigned, '');
});

test('garbage, empty redesign and oversize output are errors', () => {
  assert.strictEqual(L.parseCursorOutput('nothing useful').code, 'bad_output');
  assert.strictEqual(L.parseCursorOutput('').code, 'bad_output');
  assert.strictEqual(L.parseCursorOutput(JSON.stringify({ is_coding: true, redesigned_prompt: '  ' })).code, 'bad_output');
  assert.strictEqual(L.parseCursorOutput(JSON.stringify({ is_coding: true, redesigned_prompt: 'x'.repeat(50000) })).code, 'bad_output');
});

test('request validation', () => {
  assert.strictEqual(L.validateReviewRequest({ original: 'a', improved: 'b' }), null);
  assert.ok(L.validateReviewRequest({ original: 'a' }));
  assert.ok(L.validateReviewRequest({ original: ' ', improved: 'b' }));
  assert.ok(L.validateReviewRequest({ original: 'a', improved: 'x'.repeat(50000) }));
  assert.ok(L.validateReviewRequest(null));
});

test('extension ID derivation matches the manifest key and the Chrome alphabet', () => {
  const id = L.extensionIdFromKey(require('../manifest.json').key);
  assert.match(id, /^[a-p]{32}$/);
});
