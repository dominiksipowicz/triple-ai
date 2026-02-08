# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TripleAI — a Chrome Extension (Manifest V3) that displays multiple AI chat interfaces (ChatGPT, Gemini, Grok, Claude) side-by-side in iframes on a single dashboard page, synchronizing text input and submitting prompts simultaneously.

## Architecture

Chrome Extension with four layers:

1. **Dashboard** (`dashboard/`): Full-screen Chrome tab opened on extension icon click. Split-pane iframe layout with a toolbar (sync toggle) and settings slide-over panel. Each enabled AI service is embedded as an iframe.

2. **Header Stripping** (`rules.json`): `declarativeNetRequest` rules that remove `X-Frame-Options` and `Content-Security-Policy` headers from AI chat domains for `sub_frame` requests, allowing iframe embedding.

3. **Content Scripts** (`content-scripts/`): Site-specific DOM adapters (`chatgpt.js`, `gemini.js`, `grok.js`, `claude.js`) plus shared `sync-engine.js`. Declared with `all_frames: true` so they inject into iframes. Each adapter exposes `findInput()`, `getText()`, `setText()`, `submit()`, `observeInput()` via `window.__tripleAI`.

4. **Service Worker** (`background/service-worker.js`): Tracks frames by `{tabId, frameId}` (since all iframes share the same tab). Routes `TEXT_CHANGED` and `SUBMIT_TRIGGERED` messages between frames using `chrome.tabs.sendMessage` with `frameId` option.

## Key Patterns

- Content scripts use `all_frames: true` to run inside iframes on the dashboard
- Service worker tracks `managedFrames[]` with `{tabId, frameId, serviceKey}` instead of just tabId
- Messages sent to specific frames via `chrome.tabs.sendMessage(tabId, msg, { frameId })`
- Message types: `REGISTER`, `TEXT_CHANGED`, `SYNC_TEXT`, `SUBMIT_TRIGGERED`, `DO_SUBMIT`, `SYNC_STATE_CHANGED`
- Settings stored in `chrome.storage.local` with keys: `services`, `syncEnabled`
- DOM selectors use fallback arrays since AI chat UIs change frequently
- `MutationObserver` + retry loops handle SPA dynamic loading
