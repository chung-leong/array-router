// test that works with JSDOM can't run at the same time
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

function createTrigger() {
  let pair;
  const promise = new Promise((...args) => pair = args)
  promise.resolve = pair[0];
  promise.reject = pair[1];
  return promise;
}

export async function withReactDOM(cb) {
  acquireLock();
  const { createRoot } = await import('react-dom/client');
  const { act } = await import('react-dom/test-utils');
  const node = document.body.appendChild(document.createElement('div'));
  const root = createRoot(node);
  try {
    await cb({
      render: (el) => act(() => root.render(el)),
      unmount: () => act(() => root.unmount()),
      root,
      node,
      act,
    });
  } finally {
    await act(() => root.unmount());
    node.remove();
    releaseLock();
  }
}
