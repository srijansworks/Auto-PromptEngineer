# AutoPrompter

AutoPrompter is a personal Chromium extension. You write a prompt in ChatGPT or Claude, click Improve prompt, and Gemini rewrites it into a detailed, numbered, specific prompt without changing what you want. You review the result, edit it if you like, and decide what gets sent.

The final answer is still generated in your normal ChatGPT or Claude browser session. AutoPrompter does not call any OpenAI or Anthropic API.

## What it is not

It is not a chat app, a network proxy, or a hosted service. It has no accounts, analytics or cloud storage. It does not scrape Gemini or Cursor pages.

## Cost and credentials

The optimizer needs its own Gemini API key from Google AI Studio. A ChatGPT or Claude subscription does not include API access, and neither does it cover Gemini. Gemini API usage has its own free tier limits and may cost money beyond them. Read Google's current terms, including how free tier requests may be used, before you send sensitive text.

## Install

Requirements: macOS, a Chromium browser with Manifest V3 support (Chrome, Brave, Edge, Arc), Node 18 or later only if you want to run the tests.

1. Open `chrome://extensions` and turn on Developer mode.
2. Click Load unpacked and choose this folder (the one that contains `manifest.json`).
3. Click the AutoPrompter toolbar icon. It opens the settings page.
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

Use the **Intercept: on/off** switch beside Improve prompt to toggle interception for the current site. The choice is saved per site and also appears in settings. With interception off, you can still click Improve prompt manually. When on, AutoPrompter opens the review panel before these tested submission paths send your text:

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

Run `npm test`. It runs 50 tests: interception rules, settings validation, Gemini request and response handling, text safety checks, the native messaging protocol, Cursor argument safety and output parsing, and end to end runs of the helper against a fake Cursor program. No dependencies are needed.

The content script flow (manual actions, interception, errors, stale draft handling) was also exercised in a browser against a local fixture page that imitates a ProseMirror composer, including the Cursor section with stubbed replies. That page is `test/fixture/index.html`.

It has not been verified against live chatgpt.com or claude.ai. Load it, try both sites, and expect to adjust selectors once.

## Cursor as a second reviewer (coding prompts)

Gemini improves the prompt first. For coding work you can then click Review with Cursor in the review panel. Cursor redesigns the prompt for a coding agent: one sentence goal, context with [placeholders] for anything unknown, numbered testable requirements, input and output examples, a counted list of edge cases, constraints and non-goals, a numbered acceptance checklist with the commands to run, a plan of at most 5 steps first, and how to report back. It also lists gaps and risks it found in the Gemini version.

Cursor's version is shown in its own box and is not applied until you click Use Cursor version in the editor. You can click Restore Gemini version, edit freely, and then choose Replace draft, Approve and send, Keep original, or Cancel as usual. If Cursor decides the prompt is not a coding task, it says so and changes nothing.

### Setup

1. Install the Cursor CLI and sign in. The command is `agent` (some installs call it `cursor-agent`). Run `agent login` once, or set `CURSOR_API_KEY`.
2. From the project folder, register the helper for your browser:

```bash
node helper/install.js --browser chrome
```

   Use `brave`, `edge` or `chromium` for those browsers. Run it again if you install Cursor later or move the project folder. `node helper/install.js --uninstall` removes everything it created.
3. Reload the extension at `chrome://extensions`.
4. In AutoPrompter settings, tick the Cursor option and click Test Cursor helper. It reports the Cursor version and whether you are signed in.

The extension has a fixed ID, set by the `key` field in `manifest.json`, so the installer can authorize it without you looking anything up. Only that extension can talk to the helper.

### What Cursor can and cannot do

- It runs only when you click the button.
- It runs in a new, empty temporary folder that is deleted afterwards. It has no access to your code.
- The helper runs one fixed command with no shell: `agent -p --output-format text --mode ask --sandbox enabled --trust --workspace <empty folder> <prompt>`. It never passes `--force` or `--yolo`, and a test enforces that.
- It has a 120 second limit and an output size cap.
- It uses your Cursor plan, separate from Gemini.
- The prompt is passed as a command argument, so it is briefly visible to other programs on your Mac that list processes. The Cursor docs do not describe reading it from stdin.

Not verified: Cursor is not installed on the machine where this was built, so the helper was tested end to end against a fake `agent` program, and the flags come from Cursor's documentation. Cursor's own docs do not say exactly what ask mode restricts, which is why the empty folder is the real protection. Run Test Cursor helper first, and if a flag has changed, `helper/lib.js` (`buildArgs`) is the one place to edit.

## Layout

```
manifest.json
src/background.js        Gemini calls, key handling, sender checks
src/core/                settings, text checks, interception rules, prompt, Gemini client
src/content/             site adapters, review panel UI, content script
src/options/             settings page
helper/                  native messaging host and installer for the Cursor review
test/                    unit tests and browser fixture
```
