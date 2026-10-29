# PromptRelay

PromptRelay is a personal Chromium extension. You write a prompt in ChatGPT or Claude, click Improve prompt, and Gemini rewrites it into a detailed, numbered, specific prompt without changing what you want. You review the result, edit it if you like, and decide what gets sent.

The final answer is still generated in your normal ChatGPT or Claude browser session. PromptRelay does not call any OpenAI or Anthropic API.

## What it is not

It is not a chat app, a network proxy, or a hosted service. It has no accounts, analytics or cloud storage. It does not scrape Gemini or Cursor pages.

## Cost and credentials

The optimizer needs its own Gemini API key from Google AI Studio. A ChatGPT or Claude subscription does not include API access, and neither does it cover Gemini. Gemini API usage has its own free tier limits and may cost money beyond them. Read Google's current terms, including how free tier requests may be used, before you send sensitive text.

## Install

Requirements: macOS, a Chromium browser with Manifest V3 support (Chrome, Brave, Edge, Arc), Node 18 or later only if you want to run the tests.

1. Open `chrome://extensions` and turn on Developer mode.
2. Click Load unpacked and choose this folder (the one that contains `manifest.json`).
3. Click the PromptRelay toolbar icon. It opens the settings page.
4. Paste your Gemini API key, check the model name, and click Save and test connection.
5. Open chatgpt.com or claude.ai and reload the tab.

## Use

Manual mode is the default.

1. Type a prompt.
2. Click Improve prompt, which floats above the message box.
3. The review panel shows Original and Improved side by side. The improved text is editable.
4. Choose one action:
   - Replace draft: puts the improved text in the message box. Nothing is sent.
   - Approve and send: puts the reviewed text in the message box and clicks send once.
   - Keep original: closes the panel and leaves your draft exactly as it was.
   - Cancel: closes the panel. Nothing changes and nothing is sent.

Warnings appear if code blocks, inline code or URLs from your original are missing from the improved version.

## Rewrite styles

Set the style in settings.

- **Expand (default):** turns a short or vague draft into a spec. It sets exact counts, numeric criteria and thresholds, scoring scales, a numbered output structure, reasoning and risks per item, ranked skills, concrete next steps with deadlines, and a request to flag uncertain facts. Vague words such as "cool" or "best" become measurable criteria. For coding drafts it adds language and version, example inputs and outputs, edge cases, tests, a numbered acceptance checklist and a short plan before code. Casual one line questions get a light touch.
- **Faithful:** only clarifies wording. It never adds requirements.

Every number or interpretation Expand chooses for you is listed under "Assumptions I made" in the review panel, so you can change it before sending.

**About me:** a short profile in settings (skills, experience, goals, location). In Expand style the rewritten prompt asks the assistant to explain how each item applies to you, using only the facts you wrote. With no profile, the prompt includes a "My background: [fill in]" line. The profile is sent to Gemini with each request, so keep secrets out of it.

Gemini follows these rules most of the time, not always. Review the result before sending.

## Interception mode (opt in, per site)

Turn it on in settings for ChatGPT, Claude, or both. When on, PromptRelay opens the review panel before these tested submission paths send your text:

- Enter in the main message box
- Ctrl or Cmd plus Enter in the main message box
- A click on the site's send button

Not intercepted: Shift+Enter (still a newline), Alt+Enter, Enter during IME composition, other inputs and forms, voice controls, and page shortcuts. Only the active main composer is watched.

In this mode the panel labels the third button Keep original and send, because you already asked to send. If Gemini fails, you get Retry, Send original, or Cancel. Nothing is sent or blocked silently.

This is interception of specific UI paths, not of the network. If a site adds a new way to submit, it will not be caught until the adapter is updated. If you set a site to require Ctrl+Enter to send, plain Enter will also open the panel while interception is on.

While the panel is open, Enter and the send button in the message box are blocked, so a stray keypress cannot send the original.

## Privacy

- Your draft goes to `generativelanguage.googleapis.com` only when you click Improve prompt or trigger interception.
- The API key is stored in extension storage and read only by the background worker. Content scripts on chatgpt.com and claude.ai cannot read it. It is sent in a request header, never in a URL.
- Settings (model, toggles) sync through your browser profile. The key does not.
- The optimizer is told to treat your draft as data and not to follow instructions inside it. This reduces, but cannot eliminate, the chance of a manipulated rewrite, which is why review comes first.

## Limits

- Text only. Attachments are left alone and not sent to Gemini.
- Default maximum prompt size is 20000 characters (configurable).
- Selectors for the message box and send button live in `src/content/adapters.js`. Sites change their markup, so this is the file to fix when the button disappears or interception stops working.

## Status and testing

Run `npm test`. It runs 33 unit tests for the interception rules, settings validation, Gemini request and response handling, and text safety checks. No dependencies are needed.

The content script flow (manual actions, interception, errors, stale draft handling) was also exercised in a browser against a local fixture page that imitates a ProseMirror composer. That page is `test/fixture/index.html`.

It has not been verified against live chatgpt.com or claude.ai. Load it, try both sites, and expect to adjust selectors once.

## Cursor CLI review (not built yet)

An optional code review step through the Cursor CLI is planned but not implemented. A browser extension cannot run local commands, so it would need a small local helper registered through Chrome native messaging, called only for prompts you mark as coding tasks. That is deliberately left out of this MVP.

## Layout

```
manifest.json
src/background.js        Gemini calls, key handling, sender checks
src/core/                settings, text checks, interception rules, prompt, Gemini client
src/content/             site adapters, review panel UI, content script
src/options/             settings page
test/                    unit tests and browser fixture
```
