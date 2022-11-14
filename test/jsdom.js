export async function withJSDOM(url, cb) {
  const { JSDOM } = await import('jsdom');
  const jsdom = new JSDOM('<!doctype html><html><body></body></html>', { url });
  const { window } = jsdom;
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
