const test = require('node:test');
const assert = require('node:assert');
const T = require('../src/core/text');

test('normalize handles CRLF, nbsp, trailing spaces and edge newlines', () => {
  assert.strictEqual(T.normalize('\r\n a  \r\nb c \n\n'), ' a\nb c');
});

test('sameText ignores whitespace noise only', () => {
  assert.ok(T.sameText('a\nb ', 'a\r\nb'));
  assert.ok(!T.sameText('a b', 'a  b'));
});

test('findDroppedLiterals reports missing code, inline code and URLs', () => {
  const original = 'Fix `foo()` at https://example.com/x.\n```py\nprint(1)\n```';
  assert.deepStrictEqual(T.findDroppedLiterals(original, original), []);
  const dropped = T.findDroppedLiterals(original, 'Fix the function.');
  assert.deepStrictEqual(dropped.map((d) => d.kind).sort(), ['URL', 'code block', 'inline code']);
  assert.strictEqual(dropped.find((d) => d.kind === 'URL').value, 'https://example.com/x');
});

test('URLs inside a kept code block are not reported separately', () => {
  const original = '```\ncurl https://a.test/x\n```';
  assert.deepStrictEqual(T.findDroppedLiterals(original, original), []);
});
