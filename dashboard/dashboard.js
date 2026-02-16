// Dashboard - Full-screen split-pane iframe layout

const SERVICE_META = {
  chatgpt:    { name: 'ChatGPT',    icon: 'C', url: 'https://chatgpt.com/' },
  gemini:     { name: 'Gemini',     icon: 'G', url: 'https://gemini.google.com/app' },
  grok:       { name: 'Grok',       icon: 'X', url: 'https://grok.com/' },
  claude:     { name: 'Claude',     icon: 'A', url: 'https://claude.ai/new' },
  v0:         { name: 'v0',        icon: 'V', url: 'https://v0.app/' },
};

const SERVICE_ORDER = ['chatgpt', 'gemini', 'grok', 'claude', 'v0'];

let services = {};

// --- Title Manager ---

class TitleManager {
  constructor() {
    this.enabledServices = [];
  }

  setEnabledServices(enabledKeys) {
    this.enabledServices = enabledKeys;
  }

  async updateTitleFromFirstIframe() {
    const enabledKeys = this.enabledServices.filter(key => services[key]?.enabled);
    
    for (const serviceKey of SERVICE_ORDER) {
      if (!enabledKeys.includes(serviceKey)) continue;
      
      const title = await this.extractTitleFromIframe(serviceKey);
      if (this.isValidTitle(title)) {
        this.setDashboardTitle(title);
        return;
      }
    }
    
    // Fallback to generic title if no valid titles found
    this.setDashboardTitle('TripleAI');
  }

  extractTitleFromIframe(serviceKey) {
    return new Promise((resolve) => {
      const iframe = document.getElementById(`iframe-${serviceKey}`);
      if (!iframe) {
        resolve('');
        return;
      }

      // Check if iframe is loaded
      if (!iframe.contentWindow) {
        resolve('');
        return;
      }

      try {
        // Try to access iframe content directly
        if (iframe.contentWindow.document) {
          resolve(iframe.contentWindow.document.title);
          return;
        }
      } catch (error) {
        // Cross-origin error, try postMessage approach
        console.log(`[TripleAI] Cannot directly access ${serviceKey} iframe title, using fallback`);
      }

      // Fallback: try to get title via postMessage
      const timeout = setTimeout(() => {
        console.log(`[TripleAI] Timeout waiting for title from ${serviceKey}`);
        window.removeEventListener('message', handleMessage);
        resolve('');
      }, 2000);

      const handleMessage = (event) => {
        if (event.data && event.data.type === 'TITLE_RESPONSE' && event.data.service === serviceKey) {
          clearTimeout(timeout);
          window.removeEventListener('message', handleMessage);
          console.log(`[TripleAI] Received title from ${serviceKey}: "${event.data.title}"`);
          resolve(event.data.title || '');
        }
      };

      window.addEventListener('message', handleMessage);
      
      // Request title from iframe
      try {
        console.log(`[TripleAI] Requesting title from ${serviceKey} iframe via postMessage`);
        iframe.contentWindow.postMessage({
          type: 'REQUEST_TITLE',
          service: serviceKey
        }, '*');
      } catch (error) {
        console.log(`[TripleAI] Failed to postMessage to ${serviceKey} iframe:`, error);
        clearTimeout(timeout);
        window.removeEventListener('message', handleMessage);
        resolve('');
      }
    });
  }

  isValidTitle(title) {
    if (!title || typeof title !== 'string') return false;
    
    // Filter out generic/empty titles
    const genericTitles = [
      'chatgpt',
      'gemini',
      'grok',
      'claude',
      'v0',
      'new chat',
      'chat',
      'home',
      ''
    ];
    
    const cleanTitle = title.toLowerCase().trim();
    return !genericTitles.some(generic => cleanTitle === generic) && cleanTitle.length > 3;
  }

  setDashboardTitle(title) {
    const formattedTitle = `TTT: ${title}`;
    
    // Update browser tab title
    document.title = formattedTitle;
    
    // Update HTML title tag if it exists
    const titleElement = document.querySelector('title');
    if (titleElement) {
      titleElement.textContent = formattedTitle;
    }
    
    console.log(`[TripleAI] Title updated to: ${formattedTitle}`);
  }
}

const titleManager = new TitleManager();

// --- Init ---

async function init() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_SERVICES' });
  services = response.services;

  const statusResponse = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });

  initSyncToggle(statusResponse.syncEnabled);
  initSettings();
  renderIframes();
  initTitleManager();
}

function initTitleManager() {
  // Update title manager with enabled services
  const enabledKeys = SERVICE_ORDER.filter((key) => services[key]?.enabled);
  titleManager.setEnabledServices(enabledKeys);
  
  // Listen for title update messages from service worker
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'UPDATE_TITLE') {
      titleManager.updateTitleFromFirstIframe();
      sendResponse({ ok: true });
    }
  });
}

// --- Render iframe panes ---

function renderIframes() {
  const container = document.getElementById('iframeContainer');
  container.innerHTML = '';

  const enabledKeys = SERVICE_ORDER.filter((key) => services[key]?.enabled);

  // Update title manager with current enabled services
  titleManager.setEnabledServices(enabledKeys);

  // Add the date bar
  const dateBar = document.createElement('div');
  dateBar.className = 'date-bar';
  dateBar.id = 'dateBar';
  dateBar.textContent = formatCurrentDate();
  container.appendChild(dateBar);

  // Start a timer to keep the date current
  startDateTimer();

  if (enabledKeys.length === 0) {
    container.innerHTML = '';
    container.appendChild(dateBar);
    container.insertAdjacentHTML('beforeend', `
      <div class="empty-state" style="width:100%">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
        <p>No AI services enabled</p>
        <button class="btn" id="emptySettingsBtn">Open Settings</button>
      </div>
    `);
    document.getElementById('emptySettingsBtn')?.addEventListener('click', openSettings);
    return;
  }

  // Create a row wrapper for the panes
  const panesRow = document.createElement('div');
  panesRow.className = 'iframe-panes-row';
  container.appendChild(panesRow);

  for (const key of enabledKeys) {
    const meta = SERVICE_META[key];

    const pane = document.createElement('div');
    pane.className = 'iframe-pane';
    pane.dataset.service = key;

    pane.innerHTML = `
      <div class="pane-header">
        <span class="pane-header-name">${meta.name}</span>
        <div class="pane-header-dot ${key}">${meta.icon}</div>
      </div>
      <iframe
        class="pane-iframe"
        id="iframe-${key}"
        src="${meta.url}"
        allow="clipboard-read; clipboard-write"
      ></iframe>
    `;

    panesRow.appendChild(pane);

    const iframe = pane.querySelector(`#iframe-${key}`);
    iframe.addEventListener('load', () => {
      console.log(`[TripleAI] Iframe loaded: ${key}`);
      // Auto-focus ChatGPT iframe so user can start typing
      if (key === 'chatgpt') {
        iframe.focus();
      }
    });
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

// --- Date helpers ---

function formatCurrentDate() {
  const now = new Date();
  return now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

let dateTimerId = null;

function startDateTimer() {
  if (dateTimerId) clearInterval(dateTimerId);
  // Check every minute if the date has changed
  dateTimerId = setInterval(() => {
    const dateBar = document.getElementById('dateBar');
    if (dateBar) {
      dateBar.textContent = formatCurrentDate();
    }
  }, 60000);
}

// --- Start ---

init();
