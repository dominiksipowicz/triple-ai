// Shared Sync Engine - loaded alongside each site-specific adapter
// Reads from window.__tripleAI set by the adapter, handles message passing with service worker

(() => {
  const LOG_PREFIX = '[TripleAI]';

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
    let isSyncing = false; // Guard flag to prevent echo loops
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
      if (isSyncing) return; // Don't re-broadcast received text

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
          isSyncing = true;
          setText(message.text);
          // Reset guard after a short delay to allow DOM to settle
          setTimeout(() => { isSyncing = false; }, 200);
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
