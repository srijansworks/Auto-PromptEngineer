(function () {
  const PR = globalThis.PromptRelay;
  const siteId = PR.settings.siteFromHost(location.hostname);
  if (!siteId || window.top !== window) return;

  const adapter = PR.adapters.create(siteId, document);
  let settings = PR.settings.sanitize(null);
  // session is non-null exactly while the PromptRelay panel is open.
  const state = { session: null, bypass: false, counter: 0 };

  const siteCfg = () => settings.sites[siteId];

  // ---- talking to the background worker ------------------------------------

  async function ask(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (_) {
      return {
        ok: false,
        code: 'context',
        message: 'PromptRelay was reloaded or disabled. Refresh this page and try again.',
      };
    }
  }

  // ---- UI ------------------------------------------------------------------

  const ui = PR.ui.create({
    onImprove: () => start('manual'),
    onCancel: () => close(),
    onRetry: () => run(),
    onReplace: (text) => replace(text, false),
    onApprove: (text) => replace(text, true),
    onKeep: () => keep(),
    onCursor: (text) => askCursor(text),
  });

  function close() {
    state.session = null;
    ui.hide();
    ui.setBusy(false);
    const c = adapter.getComposer();
    if (c) c.focus();
  }

  // ---- submitting ----------------------------------------------------------

  // Clicks the site's send button once. bypass tells our own capture listeners
  // to let this one click through.
  async function submitOnce() {
    if (adapter.isGenerating()) return 'busy';
    const sendBtn = await adapter.waitForSendButton(2500);
    if (!sendBtn) return 'nobutton';
    state.bypass = true;
    try {
      sendBtn.click();
    } finally {
      state.bypass = false;
    }
    return 'sent';
  }

  function submitProblem(result) {
    return result === 'busy'
      ? 'The assistant is still generating a reply, so nothing was sent.'
      : 'The send button was not available, so nothing was sent. Press send yourself.';
  }

  // ---- flow ----------------------------------------------------------------

  async function start(trigger) {
    if (state.session) return;
    const composer = adapter.getComposer();
    if (!composer) {
      ui.toast('PromptRelay could not find the message box on this page.');
      return;
    }
    const original = adapter.readText(composer);
    if (!original.trim()) {
      ui.toast('Type a prompt first.');
      return;
    }
    state.session = { trigger, original, improved: '', acknowledged: false, working: false, id: 0 };
    ui.setBusy(true);
    await run();
  }

  async function run() {
    const s = state.session;
    if (!s) return;
    const id = ++state.counter;
    s.id = id;
    s.acknowledged = false;
    ui.showLoading();
    const res = await ask({ type: 'optimize', text: s.original });
    if (state.session !== s || s.id !== id) return; // cancelled or superseded
    if (!res.ok) {
      ui.showError(res.message || 'Something went wrong.', s.trigger);
      return;
    }
    s.improved = res.improved;
    ui.showReview({
      original: s.original,
      improved: res.improved,
      changes: res.changes,
      assumptions: res.assumptions,
      openQuestions: res.openQuestions,
      unchanged: res.unchanged,
      warnings: PR.text.findDroppedLiterals(s.original, res.improved),
      trigger: s.trigger,
      cursorEnabled: settings.cursor.enabled,
    });
  }

  async function askCursor(text) {
    const s = state.session;
    if (!s || s.working || s.cursorBusy || !text.trim()) return;
    s.cursorBusy = true;
    ui.cursorLoading();
    const res = await ask({ type: 'cursorReview', original: s.original, improved: text });
    if (state.session !== s) return;
    s.cursorBusy = false;
    if (!res.ok) {
      ui.cursorError(res.message || 'Cursor review failed.');
      return;
    }
    ui.cursorResult({
      ...res,
      warnings: res.redesigned ? PR.text.findDroppedLiterals(s.original, res.redesigned) : [],
    });
  }

  // If the draft changed while the panel was open, ask once before overwriting
  // or sending it.
  function draftChangedNeedsConfirm(s, verb) {
    const c = adapter.getComposer();
    const now = c ? adapter.readText(c) : null;
    if (now !== null && PR.text.sameText(now, s.original)) return false;
    if (s.acknowledged) return false;
    s.acknowledged = true;
    ui.notice('Your draft changed after you opened this panel. Click again to ' + verb + ' anyway.');
    return true;
  }

  async function replace(text, send) {
    const s = state.session;
    if (!s || s.working || !text.trim()) return;
    if (send && adapter.isGenerating()) {
      ui.notice(submitProblem('busy'), 'err');
      return;
    }
    if (draftChangedNeedsConfirm(s, send ? 'replace and send' : 'replace it')) return;
    s.working = true;
    ui.setActionsDisabled(true);
    try {
      const composer = adapter.getComposer();
      const ok = composer ? await adapter.writeText(composer, text) : false;
      if (!ok) {
        ui.notice('Could not write into the message box. Nothing was sent. Use Copy improved and paste it yourself.', 'err');
        return;
      }
      if (!send) {
        close();
        return;
      }
      const result = await submitOnce();
      if (result === 'sent') {
        close();
      } else {
        close();
        ui.toast('Draft replaced. ' + submitProblem(result));
      }
    } finally {
      if (state.session === s) {
        s.working = false;
        ui.setActionsDisabled(false);
      }
    }
  }

  async function keep() {
    const s = state.session;
    if (!s || s.working) return;
    if (s.trigger !== 'intercept') {
      close(); // draft was never touched
      return;
    }
    if (draftChangedNeedsConfirm(s, 'send')) return;
    s.working = true;
    ui.setActionsDisabled(true);
    const result = await submitOnce();
    close();
    if (result !== 'sent') ui.toast(submitProblem(result));
  }

  // ---- interception of tested UI submission paths --------------------------

  function composerHasText() {
    const c = adapter.getComposer();
    return Boolean(c) && adapter.readText(c).trim().length > 0;
  }

  function onKeydown(e) {
    if (!siteCfg().enabled || !adapter.isComposerTarget(e.target)) return;
    const ctx = {
      targetInComposer: true,
      interceptEnabled: siteCfg().intercept,
      busy: Boolean(state.session),
      bypass: state.bypass,
      hasText: PR.intercept.isSendKey(e) ? composerHasText() : false,
    };
    if (!PR.intercept.shouldInterceptKey(e, ctx)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (state.session) ui.pulse();
    else start('intercept');
  }

  function onClick(e) {
    if (!siteCfg().enabled || !adapter.isSendButtonTarget(e.target)) return;
    const ctx = {
      isSendButton: true,
      interceptEnabled: siteCfg().intercept,
      busy: Boolean(state.session),
      bypass: state.bypass,
      hasText: composerHasText(),
    };
    if (!PR.intercept.shouldInterceptClick(ctx)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (state.session) ui.pulse();
    else start('intercept');
  }

  document.addEventListener('keydown', onKeydown, true);
  document.addEventListener('click', onClick, true);

  // ---- floating control placement ------------------------------------------

  let raf = 0;
  function layout() {
    raf = 0;
    ui.mount();
    const c = siteCfg().enabled ? adapter.getComposer() : null;
    ui.setIntercept(siteCfg().intercept);
    ui.position(c ? c.getBoundingClientRect() : null, Boolean(c));
  }
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(layout);
  };
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('resize', schedule);
  addEventListener('scroll', schedule, true);

  // ---- settings ------------------------------------------------------------

  chrome.storage.sync.get('settings').then((r) => {
    settings = PR.settings.sanitize(r.settings);
    schedule();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) {
      settings = PR.settings.sanitize(changes.settings.newValue);
      schedule();
    }
  });
  schedule();
})();
