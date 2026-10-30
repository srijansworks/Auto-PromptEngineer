(function (root) {
  // Pure decision logic for submission interception. The content script
  // gathers the context; these functions only decide.
  //
  // ctx fields:
  //   targetInComposer  the event target is inside the active supported composer
  //   interceptEnabled  interception mode is on for this site
  //   hasText           the composer holds non-whitespace text
  //   busy              the AutoPrompter panel is open (a modal flow is running)
  //   bypass            AutoPrompter itself is submitting an approved prompt

  function isSendKey(ev) {
    // Shift+Enter and Alt+Enter are newlines. Ctrl or Cmd+Enter is a send
    // path on both sites, so it is treated like Enter.
    return ev.key === 'Enter' && !ev.shiftKey && !ev.altKey;
  }

  function shouldInterceptKey(ev, ctx) {
    if (!isSendKey(ev)) return false;
    if (ev.isComposing || ev.keyCode === 229) return false; // IME composition
    if (!ctx.targetInComposer) return false;
    if (ctx.bypass) return false;
    if (ctx.busy) return true; // panel open: never let a stray Enter send
    if (!ctx.interceptEnabled) return false;
    return ctx.hasText === true;
  }

  function shouldInterceptClick(ctx) {
    if (!ctx.isSendButton || ctx.bypass) return false;
    if (ctx.busy) return true;
    if (!ctx.interceptEnabled) return false;
    return ctx.hasText === true;
  }

  const api = { isSendKey, shouldInterceptKey, shouldInterceptClick };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.AutoPrompter = root.AutoPrompter || {}).intercept = api;
})(globalThis);
