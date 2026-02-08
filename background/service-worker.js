// TripleAI - Service Worker
// Coordinates sync between AI chat iframes on the dashboard page

const DEFAULT_SERVICES = {
  chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com/', enabled: true },
  gemini: { name: 'Gemini', url: 'https://gemini.google.com/app', enabled: true },
  grok: { name: 'Grok', url: 'https://grok.com/', enabled: true },
  claude: { name: 'Claude', url: 'https://claude.ai/new', enabled: false },
  v0: { name: 'v0', url: 'https://v0.app/', enabled: false },
};

// State
let managedFrames = []; // { tabId, frameId, serviceKey }
let syncEnabled = true;
let dashboardTabId = null;

// --- Storage helpers ---

async function getServices() {
  const result = await chrome.storage.local.get('services');
  if (!result.services) return DEFAULT_SERVICES;
  // Merge in any new services added since last save
  const merged = { ...DEFAULT_SERVICES, ...result.services };
  return merged;
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
  notifyDashboard();
}

function unregisterAllForTab(tabId) {
  managedFrames = managedFrames.filter((f) => f.tabId !== tabId);
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

  switch (message.type) {
    case 'REGISTER':
      if (tabId && message.serviceKey) {
        // Check if the sender is in the dashboard tab by URL (survives extension reloads)
        const dashboardUrl = chrome.runtime.getURL('dashboard/');
        const isDashboard = sender.tab?.url?.startsWith(dashboardUrl);
        if (isDashboard) {
          // Keep dashboardTabId in sync
          if (dashboardTabId !== tabId) dashboardTabId = tabId;
          registerFrame(tabId, frameId, message.serviceKey);
        }
        sendResponse({ syncEnabled, isDashboard });
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

// --- Init ---

initState();
