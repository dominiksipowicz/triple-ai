// DOM Adapter for ChatGPT (chatgpt.com)
// Exposes window.__tripleAI adapter for sync-engine.js

(() => {
  if (window.__tripleAI) return; // Prevent double-init
  const SERVICE_KEY = 'chatgpt';

  const SELECTORS = {
    input: [
      '#prompt-textarea',
      'div[contenteditable="true"][id="prompt-textarea"]',
      'div[contenteditable="true"]',
      'textarea[data-id="root"]',
      'textarea',
    ],
    sendButton: [
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'form button[type="submit"]',
      'button.absolute', // fallback
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
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      return el.value;
    }
    // contenteditable — trim trailing newlines from ProseMirror <p> blocks
    return (el.innerText || '').replace(/\n$/, '');
  }

  function setText(text) {
    const el = findInput();
    if (!el) return false;

    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      // Native value setter to trigger React's onChange
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      )?.set || Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(el, text);
      } else {
        el.value = text;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // contenteditable (ProseMirror) — use execCommand so the editor stays in sync
      // Only focus if the document already has focus (avoid stealing from other iframes)
      if (document.hasFocus()) el.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
      if (text) {
        document.execCommand('insertText', false, text);
      } else {
        document.execCommand('delete', false);
      }
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: text ? 'insertText' : 'deleteContentBackward' }));
    }
    return true;
  }

  function submit() {
    const btn = findElement(SELECTORS.sendButton);
    if (btn && !btn.disabled) {
      btn.click();
      return true;
    }
    // Fallback: dispatch Enter key on input
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

    const observer = new MutationObserver(check);

    function startObserving() {
      const el = findInput();
      if (!el) return false;

      // If the DOM node changed (ProseMirror re-renders), re-attach
      if (el !== observedEl) {
        if (observedEl) observer.disconnect();
        observer.observe(el, { childList: true, subtree: true, characterData: true });
        el.addEventListener('input', check);
        el.addEventListener('keyup', check);
        observedEl = el;
      }
      return true;
    }

    // Poll to catch cases where MutationObserver misses changes
    // and to re-attach if ProseMirror replaces the DOM node
    setInterval(() => {
      startObserving();
      check();
    }, 150);

    startObserving();
    return observer;
  }

  // Expose adapter
  window.__tripleAI = {
    serviceKey: SERVICE_KEY,
    findInput,
    getText,
    setText,
    submit,
    observeInput,
  };
})();
