// some tests (like those that works with JSDOM) can't run at the same time
let locked = false;
const lockQueue = [];

async function acquireLock() {
  if (locked) {
    const promise = createTrigger();
    lockQueue.push(promise);
    await promise;
  }
  locked = true;
}

async function releaseLock() {
  locked = false;
  const promise = lockQueue.shift();
  if (promise) {
    promise.resolve();
  }
}

export async function withLock(cb) {
  acquireLock();
  try {
    await cb();
  } finally {
    releaseLock();
  }
}

export async function withSilentConsole(cb, dest = {}) {
  await withLock(async () => {
    function save(name, s) {
      const target = dest[name];
      if (target instanceof Array)  {
        target.push(s);
      } else {
        dest[name] = s;
      }
    }
    const functions = [ 'debug', 'notice', 'log', 'warn', 'error'];
    const originalFns = {};
    functions.forEach(name => {
      originalFns[name] = console[name];
      console[name] = arg => save(name, arg);
    });
    try {
      await cb();
    } finally {
      functions.forEach(name => console[name] = originalFns[name]);
    }
  });
}

function createTrigger() {
  let pair;
  const promise = new Promise((...args) => pair = args)
  promise.resolve = pair[0];
  promise.reject = pair[1];
  return promise;
}
