// DOM Adapter for v0 (v0.app)
// Exposes window.__tripleAI adapter for sync-engine.js

(() => {
  if (window.__tripleAI) return; // Prevent double-init
  const SERVICE_KEY = 'v0';

  const SELECTORS = {
    input: [
      '#prompt-textarea-_new-chat_',
      'textarea[placeholder]',
      'textarea',
    ],
    sendButton: [
      'button[aria-label="Send"]',
      'button[aria-label="Submit"]',
      'button[type="submit"]',
      'form button:last-of-type',
    ],
  };

  function findElement(selectorList) {
    for (const selector of selectorList) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  function findInput() {
    return findElement(SELECTORS.input);
  }

  function getText() {
    const el = findInput();
    if (!el) return '';
    return el.value;
  }

  function setText(text) {
    const el = findInput();
    if (!el) return false;

    // Native value setter to trigger React's onChange
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(el, text);
    } else {
      el.value = text;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function submit() {
    const btn = findElement(SELECTORS.sendButton);
    if (btn && !btn.disabled) {
      btn.click();
      return true;
    }
    // Fallback: Enter key
    const el = findInput();
    if (el) {
      el.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true,
      }));
      return true;
    }
    return false;
  }

  function observeInput(callback) {
    let lastText = '';
    let observedEl = null;

    function check() {
      const current = getText();
      if (current !== lastText) {
        lastText = current;
        callback(current);
      }
    }

    function startObserving() {
      const el = findInput();
      if (!el) return false;
      if (el !== observedEl) {
        el.addEventListener('input', check);
        el.addEventListener('keyup', check);
        observedEl = el;
      }
      return true;
    }

    // Poll to re-attach after SPA navigation replaces the DOM node
    setInterval(() => {
      startObserving();
      check();
    }, 150);

    startObserving();
  }

  window.__tripleAI = {
    serviceKey: SERVICE_KEY,
    findInput,
    getText,
    setText,
    submit,
    observeInput,
  };
})();
