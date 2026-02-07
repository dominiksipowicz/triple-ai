// TripleAI - Service Worker
// Coordinates sync between AI chat iframes on the dashboard page

const DEFAULT_SERVICES = {
  chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com/', enabled: true },
  gemini: { name: 'Gemini', url: 'https://gemini.google.com/app', enabled: true },
  grok: { name: 'Grok', url: 'https://grok.com/', enabled: true },
  claude: { name: 'Claude', url: 'https://claude.ai/new', enabled: false },
  perplexity: { name: 'Perplexity', url: 'https://www.perplexity.ai/', enabled: false },
};

// Map hostnames to service keys and their adapter script files
const HOST_TO_SERVICE = {
  'chatgpt.com': { key: 'chatgpt', adapter: 'content-scripts/chatgpt.js' },
  'gemini.google.com': { key: 'gemini', adapter: 'content-scripts/gemini.js' },
  'grok.com': { key: 'grok', adapter: 'content-scripts/grok.js' },
  'claude.ai': { key: 'claude', adapter: 'content-scripts/claude.js' },
  'www.perplexity.ai': { key: 'perplexity', adapter: 'content-scripts/perplexity.js' },
};

// State
let managedFrames = []; // { tabId, frameId, serviceKey }
let syncEnabled = true;
let dashboardTabId = null;
let injectedFrames = new Set(); // Track "tabId:frameId" to avoid double-injection

// --- Storage helpers ---

async function getServices() {
  const result = await chrome.storage.local.get('services');
  return result.services || DEFAULT_SERVICES;
}

async function getSyncEnabled() {
  const result = await chrome.storage.local.get('syncEnabled');
  return result.syncEnabled !== undefined ? result.syncEnabled : true;
}

async function initState() {
  syncEnabled = await getSyncEnabled();
}

// --- Frame management ---

function registerFrame(tabId, frameId, serviceKey) {
  managedFrames = managedFrames.filter(
    (f) => !(f.tabId === tabId && f.frameId === frameId)
  );
  managedFrames.push({ tabId, frameId, serviceKey });
  console.log(`[TripleAI SW] Registered frame ${frameId} in tab ${tabId} as "${serviceKey}". Total: ${managedFrames.length}`);
  notifyDashboard();
}

function unregisterFrame(tabId, frameId) {
  managedFrames = managedFrames.filter(
    (f) => !(f.tabId === tabId && f.frameId === frameId)
  );
  injectedFrames.delete(`${tabId}:${frameId}`);
  notifyDashboard();
}

function unregisterAllForTab(tabId) {
  managedFrames = managedFrames.filter((f) => f.tabId !== tabId);
  // Clean up injectedFrames for this tab
  for (const key of [...injectedFrames]) {
    if (key.startsWith(`${tabId}:`)) injectedFrames.delete(key);
  }
}

// --- Programmatic script injection ---

async function injectIntoFrame(tabId, frameId, hostname) {
  const frameKey = `${tabId}:${frameId}`;
  if (injectedFrames.has(frameKey)) {
    console.log(`[TripleAI SW] Already injected into frame ${frameKey}, skipping`);
    return;
  }

  const service = HOST_TO_SERVICE[hostname];
  if (!service) return;

  console.log(`[TripleAI SW] Injecting scripts into frame ${frameId} (tab ${tabId}) for ${service.key}`);

  try {
    // Inject the site-specific adapter first
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      files: [service.adapter],
    });

    // Then inject the sync engine
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      files: ['content-scripts/sync-engine.js'],
    });

    injectedFrames.add(frameKey);
    console.log(`[TripleAI SW] Successfully injected into ${service.key} (frame ${frameId})`);
  } catch (e) {
    console.warn(`[TripleAI SW] Failed to inject into frame ${frameId}:`, e.message);
  }
}

// Scan all frames in a tab and inject into matching ones
async function injectIntoAllFrames(tabId) {
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    if (!frames) return;

    for (const frame of frames) {
      if (frame.frameId === 0) continue; // Skip top-level frame (dashboard itself)
      try {
        const url = new URL(frame.url);
        if (HOST_TO_SERVICE[url.hostname]) {
          await injectIntoFrame(tabId, frame.frameId, url.hostname);
        }
      } catch {
        // Invalid URL, skip
      }
    }
  } catch (e) {
    console.warn('[TripleAI SW] Failed to enumerate frames:', e.message);
  }
}

// --- Dashboard ---

async function openDashboard() {
  if (dashboardTabId !== null) {
    try {
      const tab = await chrome.tabs.get(dashboardTabId);
      if (tab) {
        await chrome.tabs.update(dashboardTabId, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
        return;
      }
    } catch {
      dashboardTabId = null;
    }
  }

  const tab = await chrome.tabs.create({
    url: chrome.runtime.getURL('dashboard/dashboard.html'),
  });
  dashboardTabId = tab.id;
}

function notifyDashboard() {
  if (dashboardTabId === null) return;
  const status = {};
  for (const frame of managedFrames) {
    status[frame.serviceKey] = {
      tabId: frame.tabId,
      frameId: frame.frameId,
      connected: true,
    };
  }
  chrome.tabs.sendMessage(dashboardTabId, {
    type: 'CONNECTION_STATUS',
    status,
    syncEnabled,
  }).catch(() => {});
}

// --- Sync broadcast ---

function broadcastText(senderTabId, senderFrameId, text) {
  if (!syncEnabled) return;

  for (const frame of managedFrames) {
    if (frame.tabId === senderTabId && frame.frameId === senderFrameId) continue;

    chrome.tabs.sendMessage(
      frame.tabId,
      { type: 'SYNC_TEXT', text },
      { frameId: frame.frameId }
    ).catch(() => {
      unregisterFrame(frame.tabId, frame.frameId);
    });
  }
}

function broadcastSubmit(senderTabId, senderFrameId) {
  if (!syncEnabled) return;

  for (const frame of managedFrames) {
    if (frame.tabId === senderTabId && frame.frameId === senderFrameId) continue;

    chrome.tabs.sendMessage(
      frame.tabId,
      { type: 'DO_SUBMIT' },
      { frameId: frame.frameId }
    ).catch(() => {
      unregisterFrame(frame.tabId, frame.frameId);
    });
  }
}

// --- Message handling ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  const frameId = sender.frameId ?? 0;

  // === DEBUG: forward logs to local server (remove when done) ===
  if (message.type === 'DEBUG_LOG') {
    fetch('http://127.0.0.1:7777/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    }).catch(() => {});
    return;
  }
  // === END DEBUG ===

  switch (message.type) {
    case 'REGISTER':
      if (tabId && message.serviceKey) {
        registerFrame(tabId, frameId, message.serviceKey);
        sendResponse({ syncEnabled });
      }
      break;

    case 'TEXT_CHANGED':
      if (tabId !== undefined) {
        broadcastText(tabId, frameId, message.text);
      }
      break;

    case 'SUBMIT_TRIGGERED':
      if (tabId !== undefined) {
        broadcastSubmit(tabId, frameId);
      }
      break;

    case 'GET_STATUS': {
      const status = {};
      for (const frame of managedFrames) {
        status[frame.serviceKey] = {
          tabId: frame.tabId,
          frameId: frame.frameId,
          connected: true,
        };
      }
      sendResponse({ status, syncEnabled });
      break;
    }

    case 'SET_SYNC_ENABLED':
      syncEnabled = message.enabled;
      chrome.storage.local.set({ syncEnabled });
      notifyDashboard();
      for (const frame of managedFrames) {
        chrome.tabs.sendMessage(
          frame.tabId,
          { type: 'SYNC_STATE_CHANGED', syncEnabled },
          { frameId: frame.frameId }
        ).catch(() => {});
      }
      sendResponse({ syncEnabled });
      break;

    case 'SAVE_SERVICES':
      chrome.storage.local.set({ services: message.services }).then(() => {
        sendResponse({ ok: true });
      });
      return true;

    case 'GET_SERVICES':
      getServices().then((svcs) => {
        sendResponse({ services: svcs });
      });
      return true;
  }
});

// --- Automatic injection when frames navigate ---

chrome.webNavigation.onCompleted.addListener((details) => {
  // Skip top-level frames
  if (details.frameId === 0) return;

  try {
    const url = new URL(details.url);
    if (HOST_TO_SERVICE[url.hostname]) {
      console.log(`[TripleAI SW] Frame navigation completed: ${url.hostname} (tab ${details.tabId}, frame ${details.frameId})`);
      injectIntoFrame(details.tabId, details.frameId, url.hostname);
    }
  } catch {
    // Invalid URL
  }
});

// --- Tab lifecycle ---

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === dashboardTabId) {
    dashboardTabId = null;
    unregisterAllForTab(tabId);
    return;
  }
  unregisterAllForTab(tabId);
});

// --- Extension icon click -> open dashboard ---

chrome.action.onClicked.addListener(() => {
  openDashboard();
});

// --- Keyboard shortcut ---

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-all-chats') {
    openDashboard();
  }
});

// --- Init ---

initState();
