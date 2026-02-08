// Shared Sync Engine - loaded alongside each site-specific adapter
// Reads from window.__tripleAI set by the adapter, handles message passing with service worker

(() => {
  const LOG_PREFIX = '[TripleAI]';

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

    // Register with service worker — only activate inside dashboard tab
    try {
      chrome.runtime.sendMessage(
        { type: 'REGISTER', serviceKey },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn(LOG_PREFIX, 'Registration failed:', chrome.runtime.lastError.message);
            return;
          }
          if (!response?.isDashboard) {
            console.log(LOG_PREFIX, `"${serviceKey}" not in dashboard tab, sync disabled`);
            return;
          }
          if (response?.syncEnabled !== undefined) {
            syncEnabled = response.syncEnabled;
          }
          console.log(LOG_PREFIX, `Registered "${serviceKey}", sync=${syncEnabled}`);
          startSync();
        }
      );
    } catch (e) {
      console.error(LOG_PREFIX, 'Failed to register:', e);
      return;
    }

    // All sync logic is deferred until we confirm we're in the dashboard tab
    function startSync() {
      // Observe local input changes and broadcast
      observeInput((text) => {
        if (text === lastSyncedText) return;
        if (!text || !text.trim()) return;

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
            if (!message.text || !message.text.trim()) break;
            lastSyncedText = message.text;
            setText(message.text);
            break;

          case 'DO_SUBMIT':
            if (!syncEnabled) break;
            setTimeout(() => submit(), 100);
            break;

          case 'SYNC_STATE_CHANGED':
            syncEnabled = message.syncEnabled;
            break;
        }
      });

      // Intercept Enter key for synchronized submit
      function handleKeydown(e) {
        if (!syncEnabled) return;
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
          setTimeout(() => {
            try {
              chrome.runtime.sendMessage({ type: 'SUBMIT_TRIGGERED' });
            } catch (err) {}
          }, 50);
        }
      }

      // Attach Enter key listener — polls to re-attach after SPA navigation
      let enterListenerEl = null;
      function attachEnterListener() {
        const el = findInput();
        if (el && el !== enterListenerEl) {
          if (enterListenerEl) enterListenerEl.removeEventListener('keydown', handleKeydown, true);
          el.addEventListener('keydown', handleKeydown, true);
          enterListenerEl = el;
        }
      }

      setInterval(attachEnterListener, 500);
      attachEnterListener();

      console.log(LOG_PREFIX, `Sync engine active for "${serviceKey}"`);
    }
  });
})();
