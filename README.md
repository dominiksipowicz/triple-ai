# TripleAI

A Chrome Extension that displays multiple AI chats side-by-side in a single page and synchronizes text input across all of them.

<img width="1795" height="1198" alt="CleanShot 2026-02-08 at 00 59 52" src="https://github.com/user-attachments/assets/57a0ad7e-13bb-48a5-b6e8-17b8a719a498" />

## All available AI chats

<img width="2875" height="1222" alt="CleanShot 2026-02-08 at 02 34 51" src="https://github.com/user-attachments/assets/63a90811-ed89-44ef-80de-cf8446e38dad" />


## Features

- **Side-by-side view** — All enabled AI chats displayed as iframes in a split-pane layout on one page
- **Synchronized typing** — Type in any AI chat and your text appears in all others in real-time
- **Simultaneous submit** — Press Enter in one chat and all connected chats submit the same prompt
- **Persistent sync** — Sync continues working across multiple conversation turns, surviving SPA navigation
- **Configurable services** — Choose which AI chats to display from the settings panel:
  - ChatGPT (`chatgpt.com`)
  - Google Gemini (`gemini.google.com/app`)
  - Grok (`grok.com`)
  - Claude (`claude.ai`)
  - [v0](https://v0.app/) (`v0.app`) - for development
- **Sync toggle** — Disable sync for independent follow-up messages
- **Keyboard shortcut** — `Ctrl+Shift+E` (Mac: `⌘+Shift+E`) to open the dashboard

## Missing feature? Just vibe code it yourself in v0

[![Open in v0](https://v0.app/chat-static/button.svg)](https://v0.app/chat/api/open?title=Open+in+v0&prompt=This+code+is+a+Chrome+Extension+that+displays+multiple+AI+chats+side-by-side+in+a+single+page+and+synchronizes+text+input+across+all+of+them.+I+want+to+modify+it.+This+is+not+Next.js+application.+This+is+not+a+website+but+a+script+for+Chrome+Extension.+Do+not+show+preview+UI+or+build+the+project.+Wait+for+my+list+of+changes.+Read+README.md.&url=https%3A%2F%2Fgithub.com%2Fdominiksipowicz%2Ftriple-ai)

You can ask v0 to open this repository make changes and you can follow below installation steps with your custom `triple-ai`

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `triple-ai` project folder
5. Click the extension icon in the toolbar to open the dashboard
6. Check Ctrl+Shift+E shortcut (if not working, try enabling it `chrome://extensions/shortcuts`

<img width="778" height="507" alt="CleanShot 2026-02-08 at 00 57 59" src="https://github.com/user-attachments/assets/7fed123b-bcd4-48e4-be80-712a85e1f2ef" />

## Usage

1. Click the extension icon to open the **Dashboard** in a new tab
2. Click the gear icon to open **Settings** and toggle AI services on/off
3. Enabled services load automatically as side-by-side iframes
4. Start typing in any AI chat — your text syncs to all others
5. Press Enter to submit to all chats simultaneously
6. Use the sync toggle in the toolbar to disable/enable sync

## Project Structure

```
triple-ai/
  manifest.json              # Chrome Extension manifest (V3)
  rules.json                 # Header stripping rules for iframe embedding
  background/
    service-worker.js         # Coordinates sync between iframe frames
  content-scripts/
    chatgpt.js                # ChatGPT DOM adapter
    gemini.js                 # Gemini DOM adapter
    grok.js                   # Grok DOM adapter
    claude.js                 # Claude DOM adapter
    sync-engine.js            # Shared sync logic
  dashboard/
    dashboard.html            # Full-screen split-pane iframe layout
    dashboard.js              # Dashboard logic
    dashboard.css             # Dashboard styles
  icons/
    icon16.png / icon48.png / icon128.png
```

## Architecture

- **Dashboard** — Full-screen Chrome tab with a toolbar and split-pane iframe layout. Each enabled AI service gets its own iframe panel. Settings slide-over panel lets you toggle services.
- **Header Stripping** — `declarativeNetRequest` rules remove `X-Frame-Options` and `Content-Security-Policy` headers from AI chat responses so they can be embedded in iframes.
- **Content Scripts** — Site-specific DOM adapters injected into each iframe (`all_frames: true`). Detect input changes, set text, and trigger submit.
- **Service Worker** — Central coordinator. Tracks frames by `{tabId, frameId}`. Routes text changes and submit events between frames.
- **Sync Engine** — Shared module loaded alongside each adapter. Handles debouncing, echo-loop prevention, and message passing.

## Security

This extension removes certain HTTP security headers from AI chat domains to allow iframe embedding. Here's what you should know:

**What headers are stripped and why:**

- `X-Frame-Options` and `Content-Security-Policy` — these normally prevent a site from being embedded in an iframe. Removing them is required for the side-by-side layout to work.
- `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`, `Cross-Origin-Resource-Policy` — cross-origin isolation headers that block iframe embedding.

**Mitigations in place:**

- Header stripping is restricted to `sub_frame` requests only — visiting ChatGPT, Gemini, or Grok in a normal browser tab is **not affected**. All their security headers remain intact.
- Content scripts (sync engine) only activate inside the TripleAI dashboard tab. They do nothing when you visit AI chat sites in normal tabs.
- The extension does not collect, store, or transmit any of your conversation data. All sync happens locally between iframes in the same browser tab.

## FAQ

### My keyboard shortcut (`Ctrl+Shift+E` / `⌘+Shift+E`) is not working

Chrome sometimes ignores the extension's suggested shortcut if another extension already uses it. To fix:

1. Go to `chrome://extensions/shortcuts`
2. Find **TripleAI**
3. Click the pencil icon next to the shortcut field
4. Press your desired shortcut (e.g., `Ctrl+Shift+E`)
5. If Chrome warns about a conflict, confirm to override

### I want a different keyboard shortcut

1. Go to `chrome://extensions/shortcuts`
2. Find **TripleAI**
3. Click the pencil icon and press your preferred key combination
4. Any valid combination works — Chrome will warn you if it conflicts with a built-in shortcut

You can also always open the dashboard by clicking the TripleAI icon in the Chrome toolbar.

### Does this extension make ChatGPT/Gemini/Grok less secure even when I'm not using the dashboard?

**No.** The security header stripping only applies to `sub_frame` (iframe) requests. When you visit chatgpt.com, gemini.google.com, or grok.com in a normal browser tab, all their security headers (`Content-Security-Policy`, `X-Frame-Options`, etc.) are fully intact and enforced. The content scripts also detect whether they're running inside the dashboard and do nothing in normal tabs.

## Notes

- DOM selectors for each AI chat may need updating if the services change their interfaces.
- Settings persist across browser restarts via `chrome.storage.local`.
- Some AI services may have additional JavaScript-based iframe detection that could prevent embedding.
