importScripts(
  'core/settings.js',
  'core/optimizer-prompt.js',
  'core/gemini.js'
);

const PR = globalThis.AutoPrompter;
const KEY_NAME = 'geminiApiKey';

// The API key lives in storage.local and is readable only from extension
// pages and this worker, never from content scripts that run inside chatgpt.com
// or claude.ai.
try {
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
} catch (_) {
  /* older Chromium: the key is still only ever read here */
}

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

async function loadSettings() {
  const { settings } = await chrome.storage.sync.get('settings');
  return PR.settings.sanitize(settings);
}

async function runOptimize(text, model) {
  const settings = await loadSettings();
  const stored = await chrome.storage.local.get(KEY_NAME);
  return PR.gemini.optimize({
    apiKey: stored[KEY_NAME] || '',
    model: model || settings.model,
    text,
    timeoutMs: settings.timeoutMs,
    maxChars: settings.maxChars,
    style: settings.style,
    profile: settings.profile,
  });
}

const HOST = 'com.promptrelay.host';
const CURSOR_TIMEOUT_MS = 150000;

function callHost(payload) {
  const call = new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(HOST, payload, (res) => {
      if (chrome.runtime.lastError || !res) {
        resolve({
          ok: false,
          code: 'no_helper',
          message: 'The AutoPrompter helper is not installed. Run "node helper/install.js" from the project folder, then reload the extension.',
        });
      } else {
        resolve(res);
      }
    });
  });
  const timeout = new Promise((resolve) =>
    setTimeout(() => resolve({ ok: false, code: 'timeout', message: 'Cursor did not answer in time.' }), CURSOR_TIMEOUT_MS)
  );
  return Promise.race([call, timeout]);
}

async function handle(msg, sender) {
  if (sender.id !== chrome.runtime.id || !msg || typeof msg.type !== 'string') {
    return { ok: false, code: 'forbidden', message: 'Unexpected sender.' };
  }
  // An extension options page may itself be hosted in a browser tab.
  const fromTab = Boolean(sender.tab) && sender.url !== chrome.runtime.getURL('src/options/options.html');

  if (msg.type === 'optimize') {
    if (typeof msg.text !== 'string') return { ok: false, code: 'empty', message: 'There is no text to improve.' };
    if (fromTab) {
      let site = null;
      try {
        site = PR.settings.siteFromHost(new URL(sender.tab.url).hostname);
      } catch (_) {}
      const settings = await loadSettings();
      if (!site || !settings.sites[site].enabled) {
        return { ok: false, code: 'forbidden', message: 'AutoPrompter is disabled on this site.' };
      }
    }
    return runOptimize(msg.text);
  }

  if (msg.type === 'cursorReview') {
    if (typeof msg.original !== 'string' || typeof msg.improved !== 'string') {
      return { ok: false, code: 'bad_request', message: 'Missing prompt text.' };
    }
    const settings = await loadSettings();
    if (!settings.cursor.enabled) {
      return { ok: false, code: 'forbidden', message: 'Cursor review is turned off in AutoPrompter settings.' };
    }
    if (fromTab) {
      let site = null;
      try {
        site = PR.settings.siteFromHost(new URL(sender.tab.url).hostname);
      } catch (_) {}
      if (!site || !settings.sites[site].enabled) {
        return { ok: false, code: 'forbidden', message: 'AutoPrompter is disabled on this site.' };
      }
    }
    return callHost({ type: 'review', original: msg.original, improved: msg.improved });
  }

  // Settings page only: never accepted from a web page's content script.
  if (msg.type === 'cursorStatus' && !fromTab) return callHost({ type: 'ping' });

  // Settings page only: never accepted from a web page's content script.
  if (msg.type === 'testConnection' && !fromTab) {
    const model = PR.settings.sanitize({ model: msg.model }).model;
    const res = await runOptimize('whats the capital of france', model);
    return res.ok ? { ok: true } : res;
  }

  return { ok: false, code: 'unknown', message: 'Unknown message.' };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender).then(sendResponse, () =>
    sendResponse({ ok: false, code: 'internal', message: 'AutoPrompter hit an internal error.' })
  );
  return true;
});
