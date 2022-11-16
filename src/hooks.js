import { useMemo, useReducer, useState, useEffect, useInsertionEffect, useContext,
  createContext, createElement, startTransition } from 'react';
import { ErrorBoundary } from './error-boundary.js';
import { RouteError, RouteChangeInterruption } from './errors.js';

const RouterContext = createContext();

class Router {
  basePath = '';
  location = null;
  parts = [];
  query = {};
  consumers = [];
  removed = [];
  lastError = null;
  onUpdate = null;
  on404 = null;

  constructor(location, basePath, trailingSlash, onUpdate, on404) {
    this.basePath = basePath;
    this.trailer = (trailingSlash) ? '/' : '';
    this.onUpdate = onUpdate;
    this.on404 = on404;
    const url = new URL(location ?? globalThis.location);
    this.location = new URL(url.origin);
    this.change(url, false, true);
  }

  updateParts(path) {
    const { parts, basePath, trailingSlash } = this;
    if (!path.startsWith(basePath)) {
      throw new Error(`"${path}" does not start with "${basePath}"`);
    }
    const newParts = path.substr(basePath.length).split('/');
    if (newParts[newParts.length - 1] === '') {
      newParts.pop();
    }
    parts.splice(0, parts.length, ...newParts);
  }

  updateQuery(searchParams) {
    const { query } = this;
    const removing = Object.keys(query);
    for (const [ name, value ] of searchParams) {
      query[name] = value;
      const index = removing.indexOf(name);
      if (index !== -1) {
        removing.splice(index, 1);
      }
    }
    for (const name of removing) {
      delete query[name];
    }
  }

  updateBrowserState(push) {
    if (typeof(window) === 'object') {
      const { history } = window;
      const { href } = this.location;
      if (push === true) {
        history.pushState({}, undefined, href);
      } else if (push === false) {
        history.replaceState({}, undefined, href);
      }
    }
  }

  createURL(parts, query) {
    const { location, basePath, trailer } = this;
    const path = parts.join('/') + (parts.length > 0 ? trailer : '');
    const url = new URL(basePath + path, location);
    const { searchParams } = url;
    for (const [ name, value ] of Object.entries(query)) {
      searchParams.append(name, value);
    }
    return url;
  }

  change(url, push, external = false) {
    const { location, parts, query } = this;
    if (location.href !== url.href) {
      const pDiff = location.pathname !== url.pathname;
      const qDiff = location.search !== url.search;
      if (pDiff) {
        this.updateParts(url.pathname);
      }
      if (qDiff) {
        this.updateQuery(url.searchParams);
      }
      if (external) {
        // recreate the URL so it confirms to trailing slash setting
        url = this.createURL(parts, query);
      }
      location.href = url.href;
      this.notifyConsumers({ pDiff, qDiff });
      this.updateBrowserState(push);
    }
  }

  setError(error) {
    if (error instanceof RouteChangeInterruption) {
      // just apply the change
      this.change(error.url, false);
      return false;
    } else if (error instanceof RouteError) {
      const { parts, query, on404 } = this;
      if (on404) {
        // see if the handler can fix the situation
        const pCopy = [ ...parts ];
        const qCopy = { ...query };
        if (on404(error, pCopy, qCopy) === false) {
          const url = this.createURL(pCopy, qCopy);
          this.change(url, false);
          return false;
        }
      }
    }
    this.lastError = error;
    this.onUpdate();
  }

  notifyConsumers({ pDiff, qDiff }) {
    const { parts, query, consumers, lastError } = this;
    const affected = consumers.filter(({ lOps, pOps, qOps, dispatch }) => {
      if (lastError) {
        return true;
      } else if (lOps) {
        return true;
      } else if (pDiff && pOps && isResultDifferent(pOps, parts)) {
        return true;
      } else if (qDiff && qOps && isResultDifferent(qOps, query)) {
        return true;
      } else {
        return false;
      }
    });
    this.lastError = null;
    if (affected.length > 0) {
      startTransition(() => {
        for (const consumer of affected) {
          consumer.dispatch();
          if (consumer.atRoot) {
            // don't bother notifying individual components when the root itself going to be updated
            break;
          }
        }
      });
    }
  }

  addConsumer(consumer) {
    this.consumers.push(consumer);
  }

  removeConsumer(consumer) {
    const index = this.consumers.indexOf(consumer);
    if (index !== -1) {
      this.consumers.splice(index, 1);
      this.removed.push(consumer);
    }
  }

  attachListeners() {
    if (typeof(window) === 'object') {
      const onLinkClick = (evt) => {
        const { target, button, defaultPrevented } = evt;
        if (button === 0 && !defaultPrevented) {
          const link = target.closest('A');
          if (link && link.origin === window.location.origin) {
            if (!link.target && !link.download) {
              let url = new URL(link);
              this.change(url, true, true);
              evt.preventDefault();
            }
          }
        }
      };
      const onPopState = (evt) => {
        const url = new URL(window.location)
        this.change(url);
      };
      window.addEventListener('click', onLinkClick);
      window.addEventListener('popstate', onPopState);
      return () => {
        window.removeEventListener('click', onLinkClick);
        window.removeEventListener('popstate', onPopState);
      };
    }
  }
}

export function useRouter(options = {}) {
  const {
    basePath = '/',
    location,
    trailingSlash = false,
    allowExtraParts = false,
    keepExtraQuery = [],
    on404,
  } = options;
  if (!basePath.endsWith('/')) {
    throw new Error('basePath should have a trailing slash');
  }
  const [ count, dispatch ] = useReducer(c => c + 1, 0);
  const router = useMemo(() => {
    return new Router(location, basePath, trailingSlash, dispatch, on404);
  }, [ location, basePath, trailingSlash, on404 ]);
  useEffect(() => router.attachListeners(), [ router ]);
  // the root component is also a route consumer, it just receive the route as arguments to
  // provide() instead of getting it as a returned value
  const [ parts, query, methods ] = useRouteFrom(router, dispatch, true);
  return (cb) => {
    const rethrow = () => {
      if (router.lastError) {
        throw router.lastError;
      }
    };
    const children = cb(parts, query, { ...methods, rethrow });
    // inspection component
    const inspection = createElement(RouterInspection, { router, allowExtraParts, keepExtraQuery });
    // catch errors from children so we can redirect it to the root component
    const boundary = createElement(ErrorBoundary, { onError: (err) => router.setError(err) }, children, inspection);
    // provide context to any children using useRoute()
    return createElement(RouterContext.Provider, { value: router }, boundary);
  };
}

function RouterInspection({ router, allowExtraParts, keepExtraQuery }) {
  const [ count, dispatch ] = useReducer(c => c + 1, 0);
  // hook runs everytime dispatch is invoked
  useEffect(() => {
    if (!router.lastError) {
      const { parts, query, removed, consumers } = router;
      if (!allowExtraParts && parts.length > 0) {
        const opLists = consumers.map(c => c.pOps);
        const extraParts = findExtraFields(opLists, function*() {
          const pCopy = [ ...parts ];
          do {
            const name = pCopy.pop();
            yield [ name, pCopy ];
          } while (pCopy.length > 0);
        });
        if (extraParts.length > 0) {
          router.setError(new RouteError(router.location));
        }
      }
      if (keepExtraQuery !== true && removed.length > 0) {
        const opLists = consumers.map(c => c.qOps);
        const extraFields = findExtraFields(opLists, function*() {
          // get the query variables used by the unmounted components
          const names = [];
          for (const { qOps } of removed) {
            if (qOps) {
              for (const { name } of qOps) {
                if (name && !names.includes(name) && !keepExtraQuery?.includes(name)) {
                  names.push(name);
                }
              }
            }
          }
          const qCopy = { ...query };
          do {
            const name = names.pop();
            delete qCopy[name];
            yield [ name, qCopy ];
          } while (names.length > 0);
        });
        if (extraFields.length > 0) {
          const newQuery = { ...query };
          for (const name of extraFields) {
            delete newQuery[name];
          }
          const url = router.createURL(parts, newQuery);
          router.change(url, false);
        }
      }
    }
    const consumer = { lOps: true, dispatch };
    router.addConsumer(consumer);
    return () => {
      router.removeConsumer(consumer);
    };
  });
}

export function useRoute() {
  const router = useRouterContext();
  const [ count, dispatch ] = useReducer(c => c + 1, 0);
  return useRouteFrom(router, dispatch);
}

export function useRoutePromise() {
  const router = useRouterContext();
  const state = usePromise();
  const [ parts, query, methods ] = useRouteFrom(router, state.dispatch);
  return [ parts, query, { changed: () => state.promise, ...methods } ];
}

export function useLocation() {
  const router = useRouterContext();
  const [ count, dispatch ] = useReducer(c => c + 1, 0);
  useMonitoring(router, { lOps: true, dispatch });
  return new URL(router.location);
}

export function useLocationPromise() {
  const router = useRouterContext();
  const state = usePromise();
  const location = new URL(router.location);
  location.changed = () => state.promise;
  const dispatch = () => {
    // update the URL first then fulfill the promise
    location.href = router.location.href;
    state.dispatch();
  };
  useMonitoring(router, { lOps: true, dispatch });
  return location;
}

function usePromise() {
  const [ state ] = useState(() => {
    let resolve;
    const promise = new Promise(r => resolve = r);
    return { promise, resolve, dispatch: null };
  });
  state.dispatch = () => {
    state.resolve();
    state.promise = new Promise(r => state.resolve = r);
  };
  return state;
}

function useRouterContext() {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('No router context');
  }
  return router;
}

function useRouteFrom(router, dispatch, atRoot = false) {
  const { parts, query, lastError, location } = router;
  // operation logs the proxies write into; they will determine whether dispatch needs
  // to be invoked when the route changes
  const pOps = [], qOps = [];
  useMonitoring(router, { pOps, qOps, dispatch, atRoot });
  // track whether the component is rendering
  let rendering = true;
  useEffect(() => { rendering = false });

  // create the proxy objects, which calls a couple callbacks
  const pProxy = createProxy(parts, pOps, onAccess, onMutation);
  const qProxy = createProxy(query, qOps, onAccess, onMutation);
  let push, pushOverride, newLocation, scheduled = false;

  function onAccess() {
    // at the root level, touching the proxies will cause the last error to be thrown during rendering
    if (atRoot && rendering && lastError) {
      throw lastError;
    }
    return rendering;
  }

  function onMutation(proxy) {
    const pushDefault = (proxy === pProxy) ? true : false;
    // we're rendering; changes need to be made by replacing
    if (rendering && pushOverride !== false) {
      throw new Error('Use of replacing() is required in this context');
    }

    // get the copies that the proxies modified
    const pCopy = getProxyCopy(pProxy, parts, true);
    const qCopy = getProxyCopy(qProxy, query, true);
    newLocation = router.createURL(pCopy, qCopy);
    if (location.href !== newLocation.href) {
      // if the changes create a different URL, then we use push for the upcoming operation
      if (!push) {
        push = pushOverride ?? pushDefault;
      }
    } else {
      // the URL got changed back to what it was, clear the push disposition
      push = undefined;
    }
    if (!scheduled) {
      // perform the change on the next tick
      Promise.resolve().then(() => {
        if (newLocation) {
          router.change(newLocation, push);
        }
        // clear the copies used by the proxies, at this point the router's copy
        // should include the changes made by the proxies
        clearProxyCopy(pProxy);
        clearProxyCopy(qProxy);
        newLocation = undefined;
        push = undefined;
        scheduled = false;
      });
      scheduled = true;
    }
  }

  function replacing(fn) {
    if (pushOverride !== undefined) {
      throw new Error('Cannot use replacing() in this context');
    }
    try {
      pushOverride = false;
      fn();
      if (rendering && newLocation) {
        // since we're rendering already, changes need to occur now
        const url = newLocation;
        newLocation = undefined;
        if (url.href !== location.href) {
          if (atRoot) {
            router.change(url, false);
          } else {
            throw new RouteChangeInterruption('Rendering interrupted by route change', url);
          }
        }
      }
    } finally {
      pushOverride = undefined;
    }
  }

  function pushing(fn) {
    if (rendering || pushOverride !== undefined) {
      throw new Error('Cannot use pushing() in this context');
    }
    try {
      pushOverride = true;
      fn();
    } finally {
      pushOverride = undefined;
    }
  }

  function throw404() {
    throw new RouteError(location)
  }

  return [ pProxy, qProxy, { throw404, pushing, replacing } ];
}

function useMonitoring(router, consumer) {
  // using useInsertionEffect here so that the useEffect hook of RouterInspection will
  // see the consumer created by the root component
  useInsertionEffect(() => {
    router.addConsumer(consumer);
    return () => {
      router.removeConsumer(consumer);
    };
  });
}

const mutatingFunctionMap = new Map([
  [ Array, [ 'copyWithin', 'fill', 'pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift' ] ],
  [ Object, [] ],
]);

function createProxy(object, ops, onAccess, onMutation) {
  const mutatingFns = mutatingFunctionMap.get(object.constructor);
  const proxy = new Proxy(object, {
    get(object, name) {
      const rendering = onAccess();
      let copy = getProxyCopy(proxy, object, true);
      const value = copy[name];
      if (typeof(value) === 'function') {
        // return a function that call the array's method and log the operation
        return function(...args) {
          const fn = function() { return value.apply(this, args) };
          const mutating = mutatingFns.includes(name);
          if (mutating) {
            // function is going to mutate the object, need to use a copy
            copy = getProxyCopy(proxy, object, false);
          }
          const result = fn.call(copy);
          if (rendering) {
            // log the function call
            ops.push({ fn, result });
          }
          if (mutating) {
            onMutation(proxy);
          }
          return result;
        };
      } else {
        // log the retrieval operation
        if (rendering) {
          // log the retrieval
          ops.push({ name, result: value })
        }
        return value;
      }
    },
    set(object, name, value) {
      onAccess();
      const copy = getProxyCopy(proxy, object, false);
      copy[name] = '' + value;
      onMutation(proxy);
      return true;
    },
    deleteProperty(object, name) {
      onAccess();
      const copy = getProxyCopy(proxy, object, false);
      delete copy[name];
      onMutation(proxy);
      return true;
    },
  });
  return proxy;
}

const proxyCopyMap = new WeakMap();

function getProxyCopy(proxy, object, readOnly) {
  let copy = proxyCopyMap.get(proxy);
  if (!copy) {
    if (readOnly) {
      // just return the original
      copy = object;
    } else {
      copy = clone(object);
      proxyCopyMap.set(proxy, copy);
    }
  }
  return copy;
}

function clearProxyCopy(proxy) {
  proxyCopyMap.delete(proxy);
}

function isResultDifferent(ops, object) {
  const copy = clone(object);
  for (const { name, fn, result } of ops) {
    const newResult = fn ? fn.call(copy) : copy[name];
    if (!compareResult(newResult, result)) {
      return true;
    }
  }
}

function findExtraFields(opLists, cb) {
  const extra = [];
  const gen = cb();
  // generator yields the name of the missing field and a copy of the object without it
  for (const [ name, object ] of gen) {
    let needed = false;
    for (const ops of opLists) {
      // if any operation produces different result, then the field is needed
      if (ops && isResultDifferent(ops, object)) {
        needed = true;
        break;
      }
    }
    if (!needed) {
      extra.push(name);
    }
  }
  return extra;
}

function compareResult(a, b) {
  if (a !== b) {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
        return false;
      }
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
          return false;
        }
      }
    } else {
      return false;
    }
  }
  return true;
}

function clone(object) {
  if (object instanceof Array) {
    return [ ...object ];
  } else {
    return { ...object };
  }
}
