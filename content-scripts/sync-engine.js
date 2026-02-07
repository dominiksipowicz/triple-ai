// Shared Sync Engine - loaded alongside each site-specific adapter
// Reads from window.__tripleAI set by the adapter, handles message passing with service worker

(() => {
  const LOG_PREFIX = '[TripleAI]';

  // === DEBUG: click/focus/sync event logging (remove when done) ===
  function _dbgLog(event, target, detail) {
    const msg = { type: 'DEBUG_LOG', service: location.hostname, event, target, detail };
    try { chrome.runtime.sendMessage(msg); } catch {}
  }
  ['click', 'focus', 'focusin', 'blur', 'focusout'].forEach(evt => {
    document.addEventListener(evt, (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      const id = e.target?.id ? `#${e.target.id}` : '';
      const cls = e.target?.className ? `.${String(e.target.className).split(' ')[0]}` : '';
      const role = e.target?.getAttribute?.('role') || '';
      const ce = e.target?.contentEditable === 'true' ? ' [CE]' : '';
      _dbgLog(evt.toUpperCase(), `<${tag}${id}${cls}>${ce}`, role ? `role="${role}"` : '');
    }, true);
  });
  // === END DEBUG ===

  // === DEBUG: log sync messages passing through this frame ===
  const _origAddListener = chrome.runtime.onMessage.addListener.bind(chrome.runtime.onMessage);
  chrome.runtime.onMessage.addListener = function(fn) {
    _origAddListener((message, sender, sendResponse) => {
      if (['SYNC_TEXT', 'DO_SUBMIT', 'SYNC_STATE_CHANGED'].includes(message.type)) {
        const preview = message.text ? ` text="${message.text.slice(0, 40)}"` : '';
        _dbgLog(`RECV:${message.type}`, location.hostname, preview);
      }
      return fn(message, sender, sendResponse);
    });
  };
  const _origSendMessage = chrome.runtime.sendMessage.bind(chrome.runtime);
  const _realSendMessage = chrome.runtime.sendMessage;
  chrome.runtime.sendMessage = function(msg, ...rest) {
    if (msg && ['TEXT_CHANGED', 'SUBMIT_TRIGGERED', 'REGISTER'].includes(msg.type)) {
      const preview = msg.text ? ` text="${msg.text.slice(0, 40)}"` : '';
      _dbgLog(`SEND:${msg.type}`, location.hostname, `${msg.serviceKey || ''}${preview}`);
    }
    return _realSendMessage.call(chrome.runtime, msg, ...rest);
  };
  // === END DEBUG SYNC ===

  // Prevent double-init from manifest content_scripts + programmatic injection
  if (window.__tripleAI_syncLoaded) return;
  window.__tripleAI_syncLoaded = true;

  // Wait for the adapter to be available
  function waitForAdapter(callback, retries = 50) {
    if (window.__tripleAI) {
      callback(window.__tripleAI);
      return;
    }
    if (retries > 0) {
      setTimeout(() => waitForAdapter(callback, retries - 1), 200);
    } else {
      console.warn(LOG_PREFIX, 'No adapter found after retries. URL:', location.href);
    }
  }

  waitForAdapter((adapter) => {
    const { serviceKey, getText, setText, submit, observeInput, findInput } = adapter;

    let syncEnabled = true;
    let lastSyncedText = null; // Track last synced text to prevent echo
    let debounceTimer = null;
    const DEBOUNCE_MS = 80;

    console.log(LOG_PREFIX, `Sync engine starting for "${serviceKey}" in frame`, window.location.href);

    // Register with service worker
    try {
      chrome.runtime.sendMessage(
        { type: 'REGISTER', serviceKey },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn(LOG_PREFIX, 'Registration failed:', chrome.runtime.lastError.message);
            return;
          }
          if (response?.syncEnabled !== undefined) {
            syncEnabled = response.syncEnabled;
          }
          console.log(LOG_PREFIX, `Registered "${serviceKey}", sync=${syncEnabled}`);
        }
      );
    } catch (e) {
      console.error(LOG_PREFIX, 'Failed to register:', e);
      return;
    }

    // Observe local input changes and broadcast
    observeInput((text) => {
      // Don't re-broadcast text we just received from sync
      if (text === lastSyncedText) return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        try {
          chrome.runtime.sendMessage({ type: 'TEXT_CHANGED', text });
        } catch (e) {
          console.warn(LOG_PREFIX, 'Failed to send TEXT_CHANGED:', e);
        }
      }, DEBOUNCE_MS);
    });

    // Listen for messages from service worker
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case 'SYNC_TEXT':
          if (!syncEnabled) break;
          console.log(LOG_PREFIX, `[${serviceKey}] Received SYNC_TEXT, length=${message.text.length}`);
          lastSyncedText = message.text;
          setText(message.text);
          break;

        case 'DO_SUBMIT':
          if (!syncEnabled) break;
          console.log(LOG_PREFIX, `[${serviceKey}] Received DO_SUBMIT`);
          // Small delay to let text sync settle first
          setTimeout(() => submit(), 100);
          break;

        case 'SYNC_STATE_CHANGED':
          syncEnabled = message.syncEnabled;
          console.log(LOG_PREFIX, `[${serviceKey}] Sync state changed to ${syncEnabled}`);
          break;
      }
    });

    // Intercept Enter key for synchronized submit
    function handleKeydown(e) {
      if (!syncEnabled) return;

      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // Small delay to let the current site process the Enter naturally
        setTimeout(() => {
          try {
            chrome.runtime.sendMessage({ type: 'SUBMIT_TRIGGERED' });
          } catch (err) {
            console.warn(LOG_PREFIX, 'Failed to send SUBMIT_TRIGGERED:', err);
          }
        }, 50);
      }
    }

    // Attach Enter key listener to the input when it appears
    function attachEnterListener(retries = 40) {
      const el = findInput();
      if (el) {
        el.addEventListener('keydown', handleKeydown, true);
        console.log(LOG_PREFIX, `[${serviceKey}] Enter listener attached to input`);
      } else if (retries > 0) {
        setTimeout(() => attachEnterListener(retries - 1), 500);
      } else {
        console.warn(LOG_PREFIX, `[${serviceKey}] Could not find input element for Enter listener`);
      }
    }

    attachEnterListener();

    console.log(LOG_PREFIX, `Sync engine loaded for "${serviceKey}"`);
  });
})();
