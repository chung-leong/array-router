export async function withJSDOM(href, cb) {
  const { JSDOM } = await import('jsdom');
  const jsdom = new JSDOM('<!doctype html><html><body></body></html>', { url: href });
  const { window } = jsdom;

  // polyfill history API
  const history = [ { href, state: null } ];
  let historyIndex = 0;
  let currentState = null;
  const historyObject = {
    pushState(state, _, href) {
      historyIndex++;
      history.splice(historyIndex, history.length, { href, state });
      currentState = state;
      jsdom.reconfigure({ url: href });
    },
    replaceState(state, _, href) {
      history.splice(historyIndex, 1, { href, state });
      currentState = state;
      jsdom.reconfigure({ url: href });
    },
    go(offset) {
      const index = historyIndex + offset;
      const { href, state } = history[index];
      currentState = state;
      historyIndex = index;
      jsdom.reconfigure({ url: href });
      window.dispatchEvent(new PopStateEvent('popstate'));
    },
    forward() {
      this.go(+1);
    },
    back() {
      this.go(-1);
    },
    get state() {
      return currentState;
    },
    get length() {
      return history.length;
    }
  };
  Object.defineProperty(window, 'history', { value: historyObject });

  const keysBefore = Object.keys(global);
  global.globalThis = window;
  global.window = window;
  global.document = window.document;
  global.navigator = { userAgent: 'node.js' };
  global.requestAnimationFrame = function (callback) {
    return setTimeout(callback, 0);
  };
  global.cancelAnimationFrame = function (id) {
    clearTimeout(id);
  };
  global.jsdom = jsdom;
  copyProps(window, global);
  try {
    await cb();
  } finally {
    const keys = Object.keys(global);
    for (const key of keys.slice(keysBefore.length)) {
      delete global[key];
    }
    global.globalThis = global;
  }
}

function copyProps(src, target) {
  Object.defineProperties(target, {
    ...Object.getOwnPropertyDescriptors(src),
    ...Object.getOwnPropertyDescriptors(target),
  });
}

global.IS_REACT_ACT_ENVIRONMENT = true
