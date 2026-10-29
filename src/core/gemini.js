(function (root) {
  const prompt =
    typeof module !== 'undefined' && module.exports
      ? require('./optimizer-prompt')
      : root.PromptRelay.optimizerPrompt;

  const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';

  function fail(code, message) {
    return { ok: false, code, message };
  }

  // The API key goes in a header, never in the URL, so it cannot leak into
  // logs or error messages that include the URL.
  function buildRequest({ model, apiKey, text, nonce, style, profile }) {
    const body = {
      systemInstruction: { parts: [{ text: prompt.systemInstruction(style) }] },
      contents: [{ role: 'user', parts: [{ text: prompt.buildUserMessage(text, nonce, profile) }] }],
      generationConfig: {
        temperature: style === 'faithful' ? 0.2 : 0.4,
        maxOutputTokens: 16384,
        responseMimeType: 'application/json',
        responseSchema: prompt.RESPONSE_SCHEMA,
      },
    };
    return {
      url: ENDPOINT + encodeURIComponent(model) + ':generateContent',
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
      },
    };
  }

  function short(s) {
    return String(s || '').replace(/\s+/g, ' ').slice(0, 200);
  }

  function httpError(status, data) {
    const apiMsg = short(data && data.error && data.error.message);
    const detail = apiMsg ? ' Details: ' + apiMsg : '';
    if (status === 400 && /api key/i.test(apiMsg)) {
      return fail('bad_key', 'Gemini rejected the API key. Check it in PromptRelay settings.');
    }
    if (status === 401 || status === 403) {
      return fail('bad_key', 'Gemini refused the request (key invalid or not permitted).' + detail);
    }
    if (status === 404) {
      return fail('bad_model', 'Gemini does not know that model name. Check the model in settings.' + detail);
    }
    if (status === 429) {
      return fail('quota', 'Gemini rate limit or quota reached. Wait and retry, or check your plan.' + detail);
    }
    if (status >= 500) {
      return fail('server', 'Gemini had a server error (' + status + '). Retry in a moment.' + detail);
    }
    return fail('http', 'Gemini returned an error (' + status + ').' + detail);
  }

  function parseResponse(status, data, original, style) {
    if (status < 200 || status >= 300) return httpError(status, data);
    if (data && data.promptFeedback && data.promptFeedback.blockReason) {
      return fail('blocked', 'Gemini blocked this prompt (' + data.promptFeedback.blockReason + ').');
    }
    const cand = data && data.candidates && data.candidates[0];
    if (!cand) return fail('bad_response', 'Gemini returned no result.');
    if (cand.finishReason && cand.finishReason !== 'STOP') {
      if (cand.finishReason === 'MAX_TOKENS') {
        return fail('truncated', 'Gemini ran out of output space. Try a shorter prompt.');
      }
      return fail('blocked', 'Gemini stopped early (' + cand.finishReason + ').');
    }
    const raw = ((cand.content && cand.content.parts) || [])
      .map((p) => (typeof p.text === 'string' ? p.text : ''))
      .join('');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      return fail('bad_response', 'Gemini returned text that was not valid JSON. Retry.');
    }
    if (!parsed || typeof parsed.improved_prompt !== 'string' || !parsed.improved_prompt.trim()) {
      return fail('bad_response', 'Gemini returned an empty improved prompt.');
    }
    const improved = parsed.improved_prompt.replace(/\r\n?/g, '\n').trim();
    const limit = style === 'faithful' ? original.length * 4 + 2000 : original.length * 8 + 6000;
    if (improved.length > limit) {
      return fail('bad_response', 'Gemini returned a prompt far longer than the original. Discarded for safety.');
    }
    const list = (v, n) =>
      Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map(short).slice(0, n) : [];
    return {
      ok: true,
      improved,
      changes: list(parsed.changes, 6),
      assumptions: list(parsed.assumptions, 6),
      openQuestions: list(parsed.open_questions, 3),
      unchanged: parsed.unchanged === true,
    };
  }

  async function optimize({ fetchImpl, apiKey, model, text, timeoutMs, maxChars, nonce, style, profile }) {
    if (!apiKey) return fail('no_key', 'No Gemini API key is set. Open PromptRelay settings and add one.');
    if (!text || !text.trim()) return fail('empty', 'There is no text to improve.');
    if (text.length > maxChars) {
      return fail('too_long', 'The prompt is ' + text.length + ' characters. The limit is ' + maxChars + '.');
    }
    const doFetch = fetchImpl || fetch;
    const { url, init } = buildRequest({
      model,
      apiKey,
      text,
      style,
      profile,
      nonce: nonce || globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12),
    });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await doFetch(url, { ...init, signal: ctrl.signal });
      let data = null;
      try {
        data = await res.json();
      } catch (_) {
        /* non JSON body; handled by status below */
      }
      return parseResponse(res.status, data, text, style);
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return fail('timeout', 'Gemini did not answer within ' + Math.round(timeoutMs / 1000) + ' seconds.');
      }
      return fail('network', 'Could not reach Gemini. Check your connection.');
    } finally {
      clearTimeout(timer);
    }
  }

  const api = { buildRequest, parseResponse, optimize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.PromptRelay = root.PromptRelay || {}).gemini = api;
})(globalThis);
