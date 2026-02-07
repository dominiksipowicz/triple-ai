// Dashboard - Full-screen split-pane iframe layout

const SERVICE_META = {
  gemini:     { name: 'Gemini',     icon: 'G', url: 'https://gemini.google.com/app' },
  chatgpt:    { name: 'ChatGPT',    icon: 'C', url: 'https://chatgpt.com/' },
  grok:       { name: 'Grok',       icon: 'X', url: 'https://grok.com/' },
  claude:     { name: 'Claude',     icon: 'A', url: 'https://claude.ai/new' },
  perplexity: { name: 'Perplexity', icon: 'P', url: 'https://www.perplexity.ai/' },
};

const SERVICE_ORDER = ['gemini', 'chatgpt', 'grok', 'claude', 'perplexity'];

let services = {};
let connectionStatus = {};

// --- Init ---

async function init() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_SERVICES' });
  services = response.services;

  const statusResponse = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
  connectionStatus = statusResponse.status || {};

  initSyncToggle(statusResponse.syncEnabled);
  initSettings();
  renderIframes();
}

// --- Render iframe panes ---

function renderIframes() {
  const container = document.getElementById('iframeContainer');
  container.innerHTML = '';

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
    const isConnected = connectionStatus[key]?.connected || false;

    const pane = document.createElement('div');
    pane.className = 'iframe-pane';
    pane.dataset.service = key;

    pane.innerHTML = `
      <div class="pane-header">
        <span class="pane-dot loading" id="dot-${key}"></span>
        <span class="pane-name">${meta.name}</span>
        <div class="pane-actions">
          <button class="pane-btn" title="Reload" data-action="reload" data-service="${key}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
          <button class="pane-btn" title="Open in new tab" data-action="newtab" data-service="${key}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </button>
        </div>
      </div>
      <iframe
        class="pane-iframe"
        id="iframe-${key}"
        src="${meta.url}"
        allow="clipboard-read; clipboard-write"
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals allow-popups-to-escape-sandbox"
      ></iframe>
    `;

    container.appendChild(pane);

    // Iframe load event
    const iframe = pane.querySelector(`#iframe-${key}`);
    iframe.addEventListener('load', () => {
      const dot = document.getElementById(`dot-${key}`);
      if (dot) {
        dot.className = 'pane-dot connected';
      }
    });

    iframe.addEventListener('error', () => {
      const dot = document.getElementById(`dot-${key}`);
      if (dot) {
        dot.className = 'pane-dot error';
      }
    });
  }

  // Pane action buttons (event delegation)
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.pane-btn');
    if (!btn) return;

    const action = btn.dataset.action;
    const serviceKey = btn.dataset.service;
    const meta = SERVICE_META[serviceKey];
    if (!meta) return;

    if (action === 'reload') {
      const iframe = document.getElementById(`iframe-${serviceKey}`);
      const dot = document.getElementById(`dot-${serviceKey}`);
      if (iframe) {
        if (dot) dot.className = 'pane-dot loading';
        iframe.src = meta.url;
      }
    } else if (action === 'newtab') {
      chrome.tabs.create({ url: meta.url });
    }
  });
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

  // Click backdrop to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target === overlay.querySelector('::before')) {
      closeSettings();
    }
  });

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

    // Click row to toggle (except on the toggle itself)
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
    connectionStatus = message.status;
    document.getElementById('syncToggle').checked = message.syncEnabled;
    updateDots();
  }
});

function updateDots() {
  for (const key of SERVICE_ORDER) {
    const dot = document.getElementById(`dot-${key}`);
    if (!dot) continue;
    const isConnected = connectionStatus[key]?.connected || false;
    if (isConnected) {
      dot.className = 'pane-dot connected';
    }
  }
}

// --- Periodic status refresh ---

setInterval(async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    connectionStatus = response.status || {};
    updateDots();
  } catch {
    // Extension context may have been invalidated
  }
}, 3000);

// --- Backdrop click close ---

document.getElementById('settingsOverlay').addEventListener('click', (e) => {
  if (e.target.classList.contains('settings-overlay')) {
    closeSettings();
  }
});

// --- Start ---

init();
