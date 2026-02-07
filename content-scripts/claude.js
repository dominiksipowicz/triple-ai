// DOM Adapter for Claude (claude.ai)
// Exposes window.__tripleAI adapter for sync-engine.js

(() => {
  const SERVICE_KEY = 'claude';

  const SELECTORS = {
    input: [
      'div[contenteditable="true"].ProseMirror',
      'div.ProseMirror[contenteditable="true"]',
      'div[contenteditable="true"][aria-label]',
      'fieldset div[contenteditable="true"]',
      'div[contenteditable="true"]',
    ],
    sendButton: [
      'button[aria-label="Send Message"]',
      'button[aria-label="Send message"]',
      'button[type="submit"]',
      'fieldset button:last-of-type',
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
    // ProseMirror uses <p> elements
    el.innerHTML = '';
    const p = document.createElement('p');
    p.textContent = text;
    el.appendChild(p);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    return true;
  }

  function submit() {
    const btn = findElement(SELECTORS.sendButton);
    if (btn && !btn.disabled) {
      btn.click();
      return true;
    }
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
