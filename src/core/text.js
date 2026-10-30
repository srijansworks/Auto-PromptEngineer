(function (root) {
  // Canonical form used to compare composer text with a snapshot.
  function normalize(s) {
    return String(s)
      .replace(/\r\n?/g, '\n')
      .replace(/ /g, ' ')
      .split('\n')
      .map((line) => line.replace(/[ \t]+$/, ''))
      .join('\n')
      .replace(/^\n+|\n+$/g, '');
  }

  function sameText(a, b) {
    return normalize(a) === normalize(b);
  }

  // Code blocks, inline code and URLs in the original should survive
  // optimization untouched. Anything missing is reported so the review panel
  // can warn about it. This is a warning only, never a block.
  function findDroppedLiterals(original, improved) {
    const target = normalize(improved);
    const dropped = [];
    const seen = new Set();
    const check = (kind, value) => {
      const key = kind + '\u0000' + value;
      if (seen.has(key)) return;
      seen.add(key);
      if (!target.includes(normalize(value))) dropped.push({ kind, value });
    };
    const fence = /```[\s\S]*?```/g;
    for (const m of original.matchAll(fence)) check('code block', m[0]);
    const rest = original.replace(fence, ' ');
    for (const m of rest.matchAll(/`[^`\n]+`/g)) check('inline code', m[0]);
    for (const m of rest.matchAll(/https?:\/\/[^\s<>"'`)\]]+/g)) {
      check('URL', m[0].replace(/[.,;:!?]+$/, ''));
    }
    return dropped;
  }

  const api = { normalize, sameText, findDroppedLiterals };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.AutoPrompter = root.AutoPrompter || {}).text = api;
})(globalThis);
