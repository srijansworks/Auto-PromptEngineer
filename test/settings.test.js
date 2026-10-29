const test = require('node:test');
const assert = require('node:assert');
const S = require('../src/core/settings');

test('defaults: both sites on, interception off', () => {
  const s = S.sanitize(undefined);
  assert.strictEqual(s.sites.chatgpt.intercept, false);
  assert.strictEqual(s.sites.claude.intercept, false);
  assert.strictEqual(s.sites.claude.enabled, true);
});

test('interception only turns on for a literal true', () => {
  assert.strictEqual(S.sanitize({ sites: { claude: { intercept: 'yes' } } }).sites.claude.intercept, false);
  assert.strictEqual(S.sanitize({ sites: { claude: { intercept: true } } }).sites.claude.intercept, true);
});

test('model names that could alter the URL are rejected', () => {
  assert.strictEqual(S.sanitize({ model: 'x/../../evil?a=b' }).model, S.DEFAULTS.model);
  assert.strictEqual(S.sanitize({ model: 'gemini-2.5-pro' }).model, 'gemini-2.5-pro');
});

test('numbers are clamped', () => {
  assert.strictEqual(S.sanitize({ timeoutMs: 1 }).timeoutMs, 5000);
  assert.strictEqual(S.sanitize({ maxChars: 1e9 }).maxChars, 100000);
  assert.strictEqual(S.sanitize({ maxChars: 'abc' }).maxChars, S.DEFAULTS.maxChars);
});

test('siteFromHost only matches the supported hosts', () => {
  assert.strictEqual(S.siteFromHost('chatgpt.com'), 'chatgpt');
  assert.strictEqual(S.siteFromHost('claude.ai'), 'claude');
  assert.strictEqual(S.siteFromHost('evilchatgpt.com'), null);
  assert.strictEqual(S.siteFromHost('chatgpt.com.evil.test'), null);
});
