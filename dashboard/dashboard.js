// Dashboard - Full-screen split-pane iframe layout

const SERVICE_META = {
  chatgpt:    { name: 'ChatGPT',    icon: 'C', url: 'https://chatgpt.com/' },
  gemini:     { name: 'Gemini',     icon: 'G', url: 'https://gemini.google.com/app' },
  grok:       { name: 'Grok',       icon: 'X', url: 'https://grok.com/' },
  claude:     { name: 'Claude',     icon: 'A', url: 'https://claude.ai/new' },
  perplexity: { name: 'Perplexity', icon: 'P', url: 'https://www.perplexity.ai/' },
};

const SERVICE_ORDER = ['chatgpt', 'gemini', 'grok', 'claude', 'perplexity'];

// Map hostnames to their adapter script files
const HOST_ADAPTERS = {
  'chatgpt.com':       'content-scripts/chatgpt.js',
  'gemini.google.com': 'content-scripts/gemini.js',
  'grok.com':          'content-scripts/grok.js',
  'claude.ai':         'content-scripts/claude.js',
  'www.perplexity.ai': 'content-scripts/perplexity.js',
};

let services = {};
let injectedFrames = new Set(); // Track injected "frameId" to avoid double-injection

// --- Init ---

async function init() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_SERVICES' });
  services = response.services;

  const statusResponse = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });

  initSyncToggle(statusResponse.syncEnabled);
  initSettings();
  renderIframes();
}

// --- Render iframe panes ---

function renderIframes() {
  const container = document.getElementById('iframeContainer');
  container.innerHTML = '';
  injectedFrames.clear();

  const enabledKeys = SERVICE_ORDER.filter((key) => services[key]?.enabled);

  if (enabledKeys.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
        <p>No AI services enabled</p>
        <button class="btn" id="emptySettingsBtn">Open Settings</button>
      </div>
    `;
    document.getElementById('emptySettingsBtn')?.addEventListener('click', openSettings);
    return;
  }

  for (const key of enabledKeys) {
    const meta = SERVICE_META[key];

    const pane = document.createElement('div');
    pane.className = 'iframe-pane';
    pane.dataset.service = key;

    pane.innerHTML = `
      <iframe
        class="pane-iframe"
        id="iframe-${key}"
        src="${meta.url}"
        allow="clipboard-read; clipboard-write"
      ></iframe>
    `;

    container.appendChild(pane);

    // When iframe loads, inject content scripts directly
    const iframe = pane.querySelector(`#iframe-${key}`);
    iframe.addEventListener('load', () => {
      console.log(`[TripleAI] Iframe loaded: ${key}`);
      injectContentScripts();

      // Auto-focus ChatGPT iframe
      if (key === 'chatgpt') {
        iframe.focus();
      }
    });
  }

  // Fallback injection retries
  setTimeout(injectContentScripts, 3000);
  setTimeout(injectContentScripts, 6000);
  setTimeout(injectContentScripts, 10000);
}

// --- Direct content script injection ---
// The dashboard page itself injects scripts into iframes using chrome.scripting API.
// This is more reliable than going through the service worker, which can be suspended.

async function injectContentScripts() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
    if (!frames) return;

    for (const frame of frames) {
      if (frame.frameId === 0) continue; // Skip top-level (dashboard itself)
      if (injectedFrames.has(frame.frameId)) continue; // Already injected

      let hostname;
      try {
        hostname = new URL(frame.url).hostname;
      } catch {
        continue;
      }

      const adapter = HOST_ADAPTERS[hostname];
      if (!adapter) continue;

      try {
        // Inject site-specific adapter
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, frameIds: [frame.frameId] },
          files: [adapter],
        });

        // Inject shared sync engine
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, frameIds: [frame.frameId] },
          files: ['content-scripts/sync-engine.js'],
        });

        injectedFrames.add(frame.frameId);
        console.log(`[TripleAI] Injected into ${hostname} (frame ${frame.frameId})`);
      } catch (e) {
        console.warn(`[TripleAI] Failed to inject into ${hostname} (frame ${frame.frameId}):`, e.message);
      }
    }
  } catch (e) {
    console.warn('[TripleAI] Injection scan failed:', e.message);
  }
}

// --- Sync toggle ---

function initSyncToggle(syncEnabled) {
  const toggle = document.getElementById('syncToggle');
  toggle.checked = syncEnabled;
  toggle.addEventListener('change', () => {
    chrome.runtime.sendMessage({ type: 'SET_SYNC_ENABLED', enabled: toggle.checked });
  });
}

// --- Settings panel ---

function initSettings() {
  const overlay = document.getElementById('settingsOverlay');
  const openBtn = document.getElementById('settingsBtn');
  const closeBtn = document.getElementById('closeSettings');

  openBtn.addEventListener('click', openSettings);
  closeBtn.addEventListener('click', closeSettings);

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
      closeSettings();
    }
  });

  renderServiceToggles();
}

function openSettings() {
  document.getElementById('settingsOverlay').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settingsOverlay').classList.add('hidden');
}

function renderServiceToggles() {
  const container = document.getElementById('serviceToggles');
  container.innerHTML = '';

  for (const key of SERVICE_ORDER) {
    const service = services[key];
    const meta = SERVICE_META[key];
    if (!service || !meta) continue;

    const row = document.createElement('div');
    row.className = 'service-row';
    row.innerHTML = `
      <div class="service-dot ${key}">${meta.icon}</div>
      <div class="service-row-info">
        <div class="service-row-name">${meta.name}</div>
        <div class="service-row-url">${meta.url}</div>
      </div>
      <label class="toggle">
        <input type="checkbox" id="svc-${key}" ${service.enabled ? 'checked' : ''}>
        <span class="toggle-slider"></span>
      </label>
    `;

    const checkbox = row.querySelector(`#svc-${key}`);

    checkbox.addEventListener('change', () => {
      services[key].enabled = checkbox.checked;
      saveServicesAndRefresh();
    });

    row.addEventListener('click', (e) => {
      if (e.target === checkbox || e.target.classList.contains('toggle-slider')) return;
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change'));
    });

    container.appendChild(row);
  }
}

function saveServicesAndRefresh() {
  chrome.runtime.sendMessage({ type: 'SAVE_SERVICES', services }, () => {
    renderIframes();
  });
}

// --- Listen for status updates from service worker ---

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CONNECTION_STATUS') {
    document.getElementById('syncToggle').checked = message.syncEnabled;
  }
});

// --- Backdrop click close ---

document.getElementById('settingsOverlay').addEventListener('click', (e) => {
  if (e.target.classList.contains('settings-overlay')) {
    closeSettings();
  }
});

// --- Start ---

init();
