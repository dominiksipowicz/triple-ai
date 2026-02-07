// Shared Sync Engine - loaded alongside each site-specific adapter
// Reads from window.__tripleAI set by the adapter, handles message passing with service worker

(() => {
  // Wait for the adapter to be available
  function waitForAdapter(callback, retries = 20) {
    if (window.__tripleAI) {
      callback(window.__tripleAI);
      return;
    }
    if (retries > 0) {
      setTimeout(() => waitForAdapter(callback, retries - 1), 100);
    } else {
      console.warn('[TripleAI] No adapter found on this page');
    }
  }

  waitForAdapter((adapter) => {
    const { serviceKey, getText, setText, submit, observeInput } = adapter;

    let syncEnabled = true;
    let isSyncing = false; // Guard flag to prevent echo loops
    let debounceTimer = null;
    const DEBOUNCE_MS = 80;

    // Register with service worker
    chrome.runtime.sendMessage(
      { type: 'REGISTER', serviceKey },
      (response) => {
        if (response?.syncEnabled !== undefined) {
          syncEnabled = response.syncEnabled;
        }
      }
    );

    // Observe local input changes and broadcast
    observeInput((text) => {
      if (isSyncing) return; // Don't re-broadcast received text

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        chrome.runtime.sendMessage({ type: 'TEXT_CHANGED', text });
      }, DEBOUNCE_MS);
    });

    // Listen for messages from service worker
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case 'SYNC_TEXT':
          if (!syncEnabled) break;
          isSyncing = true;
          setText(message.text);
          // Reset guard after a short delay to allow DOM to settle
          setTimeout(() => { isSyncing = false; }, 150);
          break;

        case 'DO_SUBMIT':
          if (!syncEnabled) break;
          submit();
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
        // Small delay to let the current site process the Enter naturally
        setTimeout(() => {
          chrome.runtime.sendMessage({ type: 'SUBMIT_TRIGGERED' });
        }, 50);
      }
    }

    // Attach Enter key listener to the input when it appears
    function attachEnterListener(retries = 20) {
      const el = adapter.findInput();
      if (el) {
        el.addEventListener('keydown', handleKeydown, true);
      } else if (retries > 0) {
        setTimeout(() => attachEnterListener(retries - 1), 500);
      }
    }

    attachEnterListener();

    console.log(`[TripleAI] Sync engine loaded for ${serviceKey}`);
  });
})();
