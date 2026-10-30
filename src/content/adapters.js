(function (root) {
  // Everything that depends on a site's markup lives here. When ChatGPT or
  // Claude change their page structure, this table is the file to update.
  const SITES = {
    chatgpt: {
      composer: [
        '#prompt-textarea',
        'div.ProseMirror[contenteditable="true"]',
        'textarea[data-testid="prompt-textarea"]',
      ],
      send: ['button[data-testid="send-button"]', 'button#composer-submit-button'],
      stop: ['button[data-testid="stop-button"]'],
    },
    claude: {
      composer: [
        'div[contenteditable="true"][data-testid="chat-input"]',
        'fieldset div.ProseMirror[contenteditable="true"]',
        'div.ProseMirror[contenteditable="true"]',
      ],
      send: ['button[aria-label="Send message"]', 'button[aria-label="Send Message"]'],
      stop: ['button[aria-label="Stop response"]'],
    },
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function visible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function create(siteId, doc) {
    const cfg = SITES[siteId];
    const sendSel = cfg.send.join(',');
    const T = root.AutoPrompter.text;

    function composers() {
      const out = [];
      for (const sel of cfg.composer) {
        for (const el of doc.querySelectorAll(sel)) {
          if (!out.includes(el) && visible(el)) out.push(el);
        }
      }
      return out;
    }

    function getComposer() {
      const all = composers();
      const active = doc.activeElement;
      return all.find((c) => c === active || c.contains(active)) || all[0] || null;
    }

    function isComposerTarget(target) {
      if (!target || !(target instanceof Element)) return false;
      return composers().some((c) => c === target || c.contains(target));
    }

    function readText(el) {
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return T.normalize(el.value);
      const blocks = Array.from(el.children).filter((c) =>
        /^(P|DIV|PRE|LI|H[1-6]|BLOCKQUOTE)$/.test(c.tagName)
      );
      if (blocks.length === 0) return T.normalize(el.innerText || el.textContent || '');
      return T.normalize(blocks.map((b) => b.innerText || b.textContent || '').join('\n'));
    }

    function selectAll(el) {
      el.focus();
      const sel = doc.defaultView.getSelection();
      const range = doc.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    // Writes text into the composer the way a paste would, then reads it back.
    // Returns true only if the composer now holds exactly the requested text.
    async function writeText(el, text) {
      if (el.tagName === 'TEXTAREA') {
        el.focus();
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(el, text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(30);
        return T.sameText(readText(el), text);
      }
      const strategies = [
        () => {
          const dt = new DataTransfer();
          dt.setData('text/plain', text);
          el.dispatchEvent(
            new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
          );
        },
        () => doc.execCommand('insertText', false, text),
      ];
      for (const run of strategies) {
        selectAll(el);
        try {
          run();
        } catch (_) {
          continue;
        }
        await sleep(40);
        if (T.sameText(readText(el), text)) return true;
      }
      return false;
    }

    function findSendButton() {
      for (const sel of cfg.send) {
        const b = doc.querySelector(sel);
        if (b && b.getAttribute('aria-disabled') !== 'true' && !b.disabled) return b;
      }
      return null;
    }

    async function waitForSendButton(ms) {
      const end = Date.now() + ms;
      for (;;) {
        const b = findSendButton();
        if (b) return b;
        if (Date.now() >= end) return null;
        await sleep(50);
      }
    }

    function isSendButtonTarget(target) {
      if (!target || !(target instanceof Element)) return false;
      const b = target.closest(sendSel);
      return Boolean(b) && !b.disabled && b.getAttribute('aria-disabled') !== 'true';
    }

    function isGenerating() {
      return cfg.stop.some((s) => doc.querySelector(s));
    }

    return {
      siteId,
      getComposer,
      isComposerTarget,
      readText,
      writeText,
      waitForSendButton,
      isSendButtonTarget,
      isGenerating,
    };
  }

  (root.AutoPrompter = root.AutoPrompter || {}).adapters = { SITES, create };
})(globalThis);
