(function (root) {
  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
    .pr { --bg:#fff; --fg:#1b1b1f; --muted:#62626b; --line:#d4d4da; --accent:#2f5bd8; --accent-fg:#fff; --warn-bg:#fff4d6; --warn-fg:#6b4a00; --err-bg:#fde8e8; --err-fg:#8a1c1c; --pane:#f6f6f8; }
    @media (prefers-color-scheme: dark) {
      .pr { --bg:#222226; --fg:#ececf1; --muted:#a0a0aa; --line:#44444c; --accent:#7b9bff; --accent-fg:#101018; --warn-bg:#3a3017; --warn-fg:#f0d589; --err-bg:#3d1f1f; --err-fg:#f3b0b0; --pane:#2b2b30; }
    }
    .fab { position:fixed; z-index:2147483000; display:none; padding:5px 11px; border-radius:14px; border:1px solid var(--line); background:var(--bg); color:var(--fg); font-size:12.5px; line-height:1.2; cursor:pointer; box-shadow:0 1px 4px rgba(0,0,0,.18); }
    .fab:hover { border-color:var(--accent); }
    .fab[disabled] { opacity:.55; cursor:default; }
    .fab .tag { margin-left:6px; padding:1px 6px; border-radius:8px; background:var(--accent); color:var(--accent-fg); font-size:10.5px; }
    .overlay { position:fixed; inset:0; z-index:2147483001; display:none; align-items:center; justify-content:center; background:rgba(0,0,0,.45); }
    .panel { width:min(980px, 94vw); max-height:90vh; display:flex; flex-direction:column; background:var(--bg); color:var(--fg); border:1px solid var(--line); border-radius:12px; box-shadow:0 8px 40px rgba(0,0,0,.35); }
    .head { display:flex; justify-content:space-between; align-items:baseline; padding:12px 16px; border-bottom:1px solid var(--line); }
    .head h2 { margin:0; font-size:15px; font-weight:600; }
    .head .sub { font-size:12px; color:var(--muted); }
    .body { padding:14px 16px; overflow:auto; display:flex; flex-direction:column; gap:12px; }
    .cols { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    @media (max-width:720px) { .cols { grid-template-columns:1fr; } }
    .col label { display:block; margin-bottom:4px; font-size:12px; font-weight:600; color:var(--muted); }
    .col textarea, .col .orig { width:100%; min-height:220px; max-height:46vh; padding:10px; border:1px solid var(--line); border-radius:8px; background:var(--pane); color:var(--fg); font-size:13.5px; line-height:1.45; resize:vertical; overflow:auto; white-space:pre-wrap; }
    .col textarea:focus { outline:2px solid var(--accent); }
    .note { padding:8px 10px; border-radius:8px; font-size:12.5px; line-height:1.4; background:var(--pane); }
    .note ul { margin:4px 0 0; padding-left:18px; }
    .note b { font-weight:600; }
    .warn { background:var(--warn-bg); color:var(--warn-fg); }
    .err { background:var(--err-bg); color:var(--err-fg); }
    .state { padding:28px 8px; text-align:center; color:var(--muted); font-size:14px; }
    .foot { display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end; padding:12px 16px; border-top:1px solid var(--line); }
    .foot .spacer { flex:1; }
    button.b { padding:7px 14px; border-radius:8px; border:1px solid var(--line); background:var(--bg); color:var(--fg); font-size:13px; cursor:pointer; }
    button.b:hover { border-color:var(--accent); }
    button.b.primary { background:var(--accent); border-color:var(--accent); color:var(--accent-fg); font-weight:600; }
    button.b[disabled] { opacity:.5; cursor:default; }
    .toast { position:fixed; z-index:2147483002; left:50%; bottom:28px; transform:translateX(-50%); display:none; max-width:80vw; padding:9px 14px; border-radius:8px; background:#1b1b1f; color:#fff; font-size:13px; box-shadow:0 2px 12px rgba(0,0,0,.35); }
    .pulse { animation:pr-pulse .35s; }
    @keyframes pr-pulse { 50% { transform:scale(1.015); } }
  `;

  // Builds DOM with textContent only. Nothing from a prompt or from Gemini is
  // ever parsed as HTML.
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== false) el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  function create(cb) {
    const host = document.createElement('promptrelay-root');
    const shadow = host.attachShadow({ mode: 'closed' });
    const wrap = h('div', { class: 'pr' });
    shadow.append(h('style', {}, CSS), wrap);

    const fab = h('button', { class: 'fab', type: 'button', title: 'Improve this prompt with Gemini' }, 'Improve prompt');
    // Keep focus and selection in the composer when the button is pressed.
    fab.addEventListener('mousedown', (e) => e.preventDefault());
    fab.addEventListener('click', () => cb.onImprove());
    const overlay = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'PromptRelay review' });
    const toast = h('div', { class: 'toast', role: 'status' });
    wrap.append(fab, overlay, toast);

    // Stop key events inside the panel from reaching page shortcuts.
    for (const t of ['keydown', 'keyup', 'keypress']) host.addEventListener(t, (e) => e.stopPropagation());
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cb.onCancel();
      }
    });

    let toastTimer = 0;
    let panelEl = null;
    let edited = null;
    let noticeBox = null;

    function mount() {
      if (!host.isConnected) document.documentElement.append(host);
    }

    function openPanel(sub, bodyNodes, footNodes) {
      panelEl = h(
        'div',
        { class: 'panel' },
        h('div', { class: 'head' }, h('h2', {}, 'PromptRelay'), h('span', { class: 'sub' }, sub)),
        h('div', { class: 'body' }, noticeBox = h('div', { class: 'notice' }), bodyNodes),
        h('div', { class: 'foot' }, footNodes)
      );
      overlay.replaceChildren(panelEl);
      overlay.style.display = 'flex';
    }

    function btn(label, onclick, cls) {
      return h('button', { class: 'b ' + (cls || ''), type: 'button', onclick }, label);
    }

    function list(title, items, cls) {
      if (!items || !items.length) return null;
      return h('div', { class: 'note ' + (cls || '') }, h('b', {}, title), h('ul', {}, items.map((i) => h('li', {}, i))));
    }

    const api = {
      mount,

      position(rect, visible) {
        if (!visible || !rect) {
          fab.style.display = 'none';
          return;
        }
        fab.style.display = 'block';
        const top = Math.max(4, rect.top - fab.offsetHeight - 6);
        fab.style.top = top + 'px';
        fab.style.left = Math.max(4, rect.right - fab.offsetWidth - 8) + 'px';
      },

      setIntercept(on) {
        fab.replaceChildren('Improve prompt', on ? h('span', { class: 'tag' }, 'Intercept on') : null);
      },

      setBusy(busy) {
        fab.disabled = busy;
      },

      toast(msg) {
        toast.textContent = msg;
        toast.style.display = 'block';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => (toast.style.display = 'none'), 4500);
      },

      showLoading() {
        openPanel(
          'Sending your draft to Gemini',
          h('div', { class: 'state' }, 'Improving your prompt. Nothing has been sent to ChatGPT or Claude.'),
          [btn('Cancel', () => cb.onCancel())]
        );
      },

      showError(message, trigger) {
        const foot = [btn('Retry', () => cb.onRetry(), 'primary')];
        if (trigger === 'intercept') foot.unshift(btn('Send original', () => cb.onKeep()));
        foot.push(btn(trigger === 'intercept' ? 'Cancel' : 'Close', () => cb.onCancel()));
        openPanel(
          'Could not improve the prompt',
          h('div', { class: 'note err' }, message),
          foot
        );
      },

      showReview({ original, improved, changes, openQuestions, warnings, unchanged, trigger }) {
        const ta = h('textarea', { 'aria-label': 'Improved prompt, editable', spellcheck: 'false' });
        ta.value = improved;
        edited = ta;
        const orig = h('div', { class: 'orig' }, original);
        const intercepted = trigger === 'intercept';
        const primaries = [];
        const refresh = () => primaries.forEach((b) => (b.disabled = !ta.value.trim()));
        ta.addEventListener('input', refresh);
        const replaceBtn = btn('Replace draft', () => cb.onReplace(ta.value));
        const approveBtn = btn('Approve and send', () => cb.onApprove(ta.value), 'primary');
        primaries.push(replaceBtn, approveBtn);
        refresh();
        const warnItems = (warnings || []).map((w) => w.kind + ' missing from the improved version: ' + w.value.slice(0, 80));
        openPanel(
          unchanged ? 'Gemini found nothing to change' : 'Review the improved prompt',
          [
            h('div', { class: 'cols' },
              h('div', { class: 'col' }, h('label', {}, 'Original'), orig),
              h('div', { class: 'col' }, h('label', {}, 'Improved (editable)'), ta)),
            list('Changes', changes),
            list('Questions you may want to answer', openQuestions),
            list('Check before sending', warnItems, 'warn'),
          ],
          [
            btn('Copy improved', () => {
              navigator.clipboard.writeText(ta.value).then(
                () => api.toast('Copied.'),
                () => api.toast('Copy was blocked by the browser.')
              );
            }),
            h('span', { class: 'spacer' }),
            btn('Cancel', () => cb.onCancel()),
            btn(intercepted ? 'Keep original and send' : 'Keep original', () => cb.onKeep()),
            replaceBtn,
            approveBtn,
          ]
        );
        ta.focus();
      },

      // Inline message inside an open panel (draft changed, write failed, etc).
      notice(msg, kind) {
        if (!noticeBox) return;
        noticeBox.replaceChildren(msg ? h('div', { class: 'note ' + (kind || 'warn') }, msg) : '');
      },

      setActionsDisabled(disabled) {
        if (!panelEl) return;
        panelEl.querySelectorAll('.foot button').forEach((b) => (b.disabled = disabled));
      },

      pulse() {
        if (!panelEl) return;
        panelEl.classList.remove('pulse');
        void panelEl.offsetWidth;
        panelEl.classList.add('pulse');
      },

      hide() {
        overlay.style.display = 'none';
        overlay.replaceChildren();
        panelEl = null;
        edited = null;
        noticeBox = null;
      },
    };
    return api;
  }

  (root.PromptRelay = root.PromptRelay || {}).ui = { create };
})(globalThis);
