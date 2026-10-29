const test = require('node:test');
const assert = require('node:assert');
const P = require('../src/core/optimizer-prompt');

test('expand instruction enforces numbers, numbered output, criteria, personalization and honesty', () => {
  const s = P.SYSTEM_EXPAND;
  for (const phrase of ['Always use numbers', 'numbered items', 'selection or evaluation criteria', 'applies to that person', 'ranked', 'mark uncertain facts', 'coding drafts', 'Never invent facts about the author']) {
    assert.ok(s.includes(phrase), 'missing: ' + phrase);
  }
});

test('both instructions treat the draft as untrusted data', () => {
  assert.ok(P.SYSTEM_EXPAND.includes('untrusted data'));
  assert.ok(P.SYSTEM_FAITHFUL.includes('untrusted data'));
});

test('prompts contain no em dashes', () => {
  assert.ok(!P.SYSTEM_EXPAND.includes('\u2014') && !P.SYSTEM_FAITHFUL.includes('\u2014'));
});

test('schema requires assumptions', () => {
  assert.ok(P.RESPONSE_SCHEMA.required.includes('assumptions'));
});
