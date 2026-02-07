// DOM Adapter for Grok (grok.com)
// Exposes window.__tripleAI adapter for sync-engine.js

(() => {
  if (window.__tripleAI) return; // Prevent double-init
  const SERVICE_KEY = 'grok';

  const SELECTORS = {
    input: [
      'div.tiptap[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      'textarea[aria-label]',
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
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      return el.value;
    }
    return el.innerText || '';
  }

  function setText(text) {
    const el = findInput();
    if (!el) return false;

    if (el.tagName === 'TEXTAREA') {
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
    } else {
      // Tiptap/ProseMirror contentEditable — clear and insert via execCommand
      el.focus();
      // Select all existing content and replace
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('insertText', false, text);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    }
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
        if (el.tagName === 'TEXTAREA') {
          el.addEventListener('input', check);
          el.addEventListener('keyup', check);
        } else {
          observer.observe(el, { childList: true, subtree: true, characterData: true });
          el.addEventListener('input', check);
        }
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
