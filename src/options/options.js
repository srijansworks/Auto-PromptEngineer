(function () {
  const S = globalThis.PromptRelay.settings;
  const $ = (id) => document.getElementById(id);
  const KEY_NAME = 'geminiApiKey';
  const SITES = ['chatgpt', 'claude'];

  function say(msg, bad) {
    $('status').textContent = msg;
    $('status').style.color = bad ? '#b3261e' : '';
  }

  async function refreshKeyState() {
    const r = await chrome.storage.local.get(KEY_NAME);
    $('keyState').textContent = r[KEY_NAME] ? 'A key is stored. Leave the field empty to keep it.' : 'No key stored yet.';
  }

  async function load() {
    const { settings } = await chrome.storage.sync.get('settings');
    const s = S.sanitize(settings);
    $('model').value = s.model;
    $('style').value = s.style;
    $('profile').value = s.profile;
    $('maxChars').value = s.maxChars;
    $('timeout').value = Math.round(s.timeoutMs / 1000);
    for (const id of SITES) {
      $(id + '-enabled').checked = s.sites[id].enabled;
      $(id + '-intercept').checked = s.sites[id].intercept;
    }
    await refreshKeyState();
  }

  async function save() {
    const sites = {};
    for (const id of SITES) {
      sites[id] = { enabled: $(id + '-enabled').checked, intercept: $(id + '-intercept').checked };
    }
    const next = S.sanitize({
      model: $('model').value,
      style: $('style').value,
      profile: $('profile').value,
      maxChars: $('maxChars').value,
      timeoutMs: Number($('timeout').value) * 1000,
      sites,
    });
    await chrome.storage.sync.set({ settings: next });
    const key = $('key').value.trim();
    if (key) {
      await chrome.storage.local.set({ [KEY_NAME]: key });
      $('key').value = '';
    }
    $('model').value = next.model;
    await refreshKeyState();
    return next;
  }

  $('save').addEventListener('click', async () => {
    await save();
    say('Saved.');
  });

  $('test').addEventListener('click', async () => {
    const s = await save();
    say('Testing...');
    const res = await chrome.runtime.sendMessage({ type: 'testConnection', model: s.model });
    say(res && res.ok ? 'Connection works.' : (res && res.message) || 'Test failed.', !(res && res.ok));
  });

  $('removeKey').addEventListener('click', async () => {
    await chrome.storage.local.remove(KEY_NAME);
    await refreshKeyState();
    say('Key removed.');
  });

  load();
})();
