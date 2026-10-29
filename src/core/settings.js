(function (root) {
  const DEFAULTS = Object.freeze({
    model: 'gemini-2.5-flash',
    timeoutMs: 30000,
    maxChars: 20000,
    sites: {
      chatgpt: { enabled: true, intercept: false },
      claude: { enabled: true, intercept: false },
    },
  });

  const SITE_HOSTS = {
    'chatgpt.com': 'chatgpt',
    'www.chatgpt.com': 'chatgpt',
    'claude.ai': 'claude',
    'www.claude.ai': 'claude',
  };

  function siteFromHost(hostname) {
    return SITE_HOSTS[String(hostname).toLowerCase()] || null;
  }

  function clampInt(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  // Always returns a complete, safe settings object. The model name ends up in
  // a URL path, so it is restricted to a conservative character set.
  function sanitize(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const model =
      typeof src.model === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(src.model.trim())
        ? src.model.trim()
        : DEFAULTS.model;
    const sites = {};
    for (const id of Object.keys(DEFAULTS.sites)) {
      const s = src.sites && typeof src.sites[id] === 'object' && src.sites[id] ? src.sites[id] : {};
      sites[id] = {
        enabled: s.enabled === false ? false : true,
        intercept: s.intercept === true,
      };
    }
    return {
      model,
      timeoutMs: clampInt(src.timeoutMs, 5000, 120000, DEFAULTS.timeoutMs),
      maxChars: clampInt(src.maxChars, 500, 100000, DEFAULTS.maxChars),
      sites,
    };
  }

  const api = { DEFAULTS, siteFromHost, sanitize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.PromptRelay = root.PromptRelay || {}).settings = api;
})(globalThis);
