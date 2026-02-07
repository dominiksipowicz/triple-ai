// DOM Adapter for Gemini (gemini.google.com)
// Exposes window.__tripleAI adapter for sync-engine.js

(() => {
  const SERVICE_KEY = 'gemini';

  const SELECTORS = {
    input: [
      '.ql-editor[contenteditable="true"]',
      'div.ql-editor',
      'rich-textarea .ql-editor',
      'div[contenteditable="true"][aria-label]',
      'div[contenteditable="true"]',
    ],
    sendButton: [
      'button[aria-label="Send message"]',
      'button.send-button',
      '.send-button-container button',
      'button[mattooltip="Send message"]',
      'button[data-test-id="send-button"]',
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
    return el.innerText || '';
  }

  function setText(text) {
    const el = findInput();
    if (!el) return false;

    el.focus();
    el.innerHTML = '';
    // Gemini's Quill editor uses <p> blocks
    const p = document.createElement('p');
    p.textContent = text;
    el.appendChild(p);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    // Also dispatch for Quill's internal listener
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
      if (el) {
        observer.observe(el, { childList: true, subtree: true, characterData: true });
        el.addEventListener('input', check);
        return true;
      }
      return false;
    }

    function tryStart() {
      if (!startObserving()) {
        setTimeout(tryStart, 500);
      }
    }

    tryStart();
    return observer;
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
