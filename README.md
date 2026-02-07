# Multi-AI Chat Synchronizer

A Chrome Extension that displays multiple AI chats side-by-side in a single page and synchronizes text input across all of them.

## Features

- **Side-by-side view** — All enabled AI chats displayed as iframes in a split-pane layout on one page
- **Synchronized typing** — Type in any AI chat and your text appears in all others in real-time
- **Simultaneous submit** — Press Enter in one chat and all connected chats submit the same prompt
- **Configurable services** — Choose which AI chats to display from the settings panel:
  - Google Gemini (`gemini.google.com/app`)
  - ChatGPT (`chatgpt.com`)
  - Grok (`grok.com`)
  - Claude (`claude.ai`)
  - Perplexity (`perplexity.ai`)
- **Sync toggle** — Disable sync for independent follow-up messages
- **Keyboard shortcut** — `Ctrl+Shift+A` (Mac: `Cmd+Shift+A`) to open the dashboard

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `triple-ai` project folder
5. Click the extension icon in the toolbar to open the dashboard

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
    perplexity.js             # Perplexity DOM adapter
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

## Notes

- The extension strips security headers from AI chat domains to allow iframe embedding. This only affects `sub_frame` requests (iframes), not regular tab navigation.
- DOM selectors for each AI chat may need updating if the services change their interfaces.
- Settings persist across browser restarts via `chrome.storage.local`.
- Some AI services may have additional JavaScript-based iframe detection that could prevent embedding.
