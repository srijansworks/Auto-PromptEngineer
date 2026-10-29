const test = require('node:test');
const assert = require('node:assert');
const I = require('../src/core/intercept');

const ctx = (o = {}) => ({ targetInComposer: true, interceptEnabled: true, hasText: true, busy: false, bypass: false, ...o });
const enter = (o = {}) => ({ key: 'Enter', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, isComposing: false, keyCode: 13, ...o });

test('plain Enter and Ctrl/Cmd+Enter are intercepted when enabled', () => {
  assert.ok(I.shouldInterceptKey(enter(), ctx()));
  assert.ok(I.shouldInterceptKey(enter({ ctrlKey: true }), ctx()));
  assert.ok(I.shouldInterceptKey(enter({ metaKey: true }), ctx()));
});

test('Shift+Enter and Alt+Enter are never intercepted', () => {
  assert.ok(!I.shouldInterceptKey(enter({ shiftKey: true }), ctx()));
  assert.ok(!I.shouldInterceptKey(enter({ altKey: true }), ctx()));
});

test('IME composition is never intercepted', () => {
  assert.ok(!I.shouldInterceptKey(enter({ isComposing: true }), ctx()));
  assert.ok(!I.shouldInterceptKey(enter({ keyCode: 229 }), ctx()));
});

test('other keys, other targets, disabled mode and empty text are ignored', () => {
  assert.ok(!I.shouldInterceptKey(enter({ key: 'a' }), ctx()));
  assert.ok(!I.shouldInterceptKey(enter(), ctx({ targetInComposer: false })));
  assert.ok(!I.shouldInterceptKey(enter(), ctx({ interceptEnabled: false })));
  assert.ok(!I.shouldInterceptKey(enter(), ctx({ hasText: false })));
});

test('bypass lets the approved submission through', () => {
  assert.ok(!I.shouldInterceptKey(enter(), ctx({ bypass: true })));
  assert.ok(!I.shouldInterceptClick({ isSendButton: true, interceptEnabled: true, hasText: true, bypass: true }));
});

test('while the panel is open, Enter in the composer is swallowed even if interception is off', () => {
  assert.ok(I.shouldInterceptKey(enter(), ctx({ busy: true, interceptEnabled: false })));
  assert.ok(!I.shouldInterceptKey(enter(), ctx({ busy: true, targetInComposer: false })));
});

test('send button click rules', () => {
  const base = { isSendButton: true, interceptEnabled: true, hasText: true, busy: false, bypass: false };
  assert.ok(I.shouldInterceptClick(base));
  assert.ok(!I.shouldInterceptClick({ ...base, isSendButton: false }));
  assert.ok(!I.shouldInterceptClick({ ...base, interceptEnabled: false }));
  assert.ok(!I.shouldInterceptClick({ ...base, hasText: false }));
  assert.ok(I.shouldInterceptClick({ ...base, interceptEnabled: false, busy: true }));
});
