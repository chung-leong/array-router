import { useMemo, useReducer, useState, useEffect, useInsertionEffect, useContext,
  createContext, createElement, startTransition } from 'react';
import { ErrorBoundary } from './error-boundary.js';
import { RouteError, RouteChangeInterruption } from './errors.js';

const RouterContext = createContext();

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
    const router = {
      basePath,
      location: null,
      parts: null,
      query: null,
      consumers: [],
      removed: [],
      lastError: null,
      change(url, push) {
        if (this.location?.href !== url.href) {
          const pDiff = this.location?.pathname !== url.pathname;
          const qDiff = this.location?.search !== url.search;
          if (pDiff) {
            this.parts = parseParts(url.pathname, basePath, trailingSlash);
          }
          if (qDiff) {
            this.query = parseQuery(url.searchParams);
          }
          this.location = url;
          this.notifyConsumers({ pDiff, qDiff });
          if (typeof(window) === 'object') {
            if (push === true) {
              window.history.pushState({}, undefined, url);
            } else if (push === false) {
              window.history.replaceState({}, undefined, url);
            }
          }
        }
      },
      setError(error) {
        if (error instanceof RouteChangeInterruption) {
          // just apply the change
          this.change(error.url, false);
          return false;
        }
        this.lastError = error;
        dispatch();
      },
      notifyConsumers({ pDiff, qDiff }) {
        const { parts, query, lastError } = this;
        const affected = this.consumers.filter(({ lOps, pOps, qOps, dispatch }) => {
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
              if (consumer.dispatch === dispatch) {
                // don't bother notifying individual components when the root itself going to be updated
                break;
              }
            }
          });
        }
      },
      addConsumer(consumer) {
        this.consumers.push(consumer);
      },
      removeConsumer(consumer) {
        const index = this.consumers.indexOf(consumer);
        if (index !== -1) {
          this.consumers.splice(index, 1);
          if (keepExtraQuery !== true) {
            this.removed.push(consumer);
          }
        }
      },
    };
    router.change(new URL(location || globalThis.location));
    const initURL = new createURL(router, router.parts, router.query);
    if (initURL.href !== router.location.href) {
      router.location = initURL;
      if (typeof(window) === 'object') {
        window.history.replaceState({}, undefined, initURL);
      }
    }
    return router;
  }, [ basePath ]);
  useEffect(() => {
    if (typeof(window) === 'object') {
      const onLinkClick = (evt) => {
        const { target, button, defaultPrevented } = evt;
        if (button === 0 && !defaultPrevented) {
          const link = target.closest('A');
          if (link && link.origin === window.location.origin) {
            if (!link.target && !link.download) {
              let url = new URL(link);
              const parts = parseParts(url.pathname, basePath, trailingSlash);
              const query = parseQuery(url.searchParams);
              url = createURL(router, parts, query);
              router.change(url, true);
              evt.preventDefault();
            }
          }
        }
      };
      const onPopState = (evt) => {
        const url = new URL(window.location)
        router.change(url);
      };
      window.addEventListener('click', onLinkClick);
      window.addEventListener('popstate', onPopState);
      return () => {
        window.removeEventListener('click', onLinkClick);
        window.removeEventListener('popstate', onPopState);
      };
    }
  }, [ router ]);
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
      if (!allowExtraParts) {
        const { parts, consumers } = router;
        if (parts.length > 0) {
          const copy = [ ...parts ];
          const extra = [];
          let needed = false;
          do {
            // pop off an item and see if we get different results
            const part = copy.pop();
            for (const { pOps } of consumers) {
              if (pOps && isResultDifferent(pOps, copy)) {
                needed = true;
                break;
              }
            }
            if (!needed) {
              extra.unshift(part);
            }
          } while (copy.length > 0 && !needed);
          if (extra.length > 0) {
            router.setError(new RouteError(router.location));
          }
        }
      }
      if (keepExtraQuery !== true) {
        const { parts, query, removed, consumers } = router;
        const keys = [];
        while (removed.length > 0) {
          const { qOps } = removed.pop();
          if (qOps) {
            for (const { name } of qOps) {
              if (name && !keys.includes(name))  {
                if (!Array.isArray(keepExtraQuery) || !keepExtraQuery.includes(name)) {
                  keys.push(name);
                }
              }
            }
          }
        }
        if (keys.length > 0) {
          const copy = { ...query };
          const extra = [];
          do {
            // remove a prop and see if we get different results
            let needed = false;
            const key = keys.pop();
            delete copy[key];
            for (const { qOps } of consumers) {
              if (qOps && isResultDifferent(qOps, copy)) {
                needed = true;
                break;
              }
            }
            if (!needed) {
              extra.unshift(key);
            }
          } while (keys.length > 0);
          if (extra.length > 0) {
            const newQuery = { ...query };
            for (const name of extra) {
              delete newQuery[name];
            }
            const url = createURL(router, parts, newQuery);
            router.change(url, false);
          }
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
  const [ state ] = useState(() => {
    let resolve;
    const promise = new Promise(r => resolve = r);
    return { promise, resolve };
  });
  const dispatch = () => {
    // copy values into underlying objects of proxies
    const array = parts[SymbolUnderlying];
    const object = query[SymbolUnderlying];
    array.splice(0, array.length, ...router.parts);
    for (const name in object) {
      delete object[name];
    }
    Object.assign(object, router.query);
    state.resolve();
    state.promise = new Promise(r => state.resolve = r);
  };
  const [ parts, query, methods ] = useRouteFrom(router, dispatch);
  return [ parts, query, { changed: () => state.promise, ...methods } ];
}

export function useLocation() {
  const router = useRouterContext();
  const [ count, dispatch ] = useReducer(c => c + 1, 0);
  useMonitoring(router, { lOps: true, dispatch });
  return router.location;
}

function useRouterContext() {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('No router context');
  }
  return router;
}

function useRouteFrom(router, dispatch, atRoot = false) {
  const pOps = [], qOps = [];
  useMonitoring(router, { pOps, qOps, dispatch });
  const state = { rendering: true, error: (atRoot) ? router.lastError : null };
  useEffect(() => {
    state.rendering = false;
  });

  let push, pushOverride, newLocation, scheduled = false;
  const pushing = (fn) => {
    if (state.rendering || pushOverride !== undefined) {
      throw new Error('Cannot use pushing() in this context');
    }
    try {
      pushOverride = true;
      fn();
    } finally {
      pushOverride = undefined;
    }
  };
  const replacing = (fn) => {
    if (pushOverride !== undefined) {
      throw new Error('Cannot use replacing() in this context');
    }
    try {
      pushOverride = false;
      fn();
    } finally {
      if (state.rendering && newLocation) {
        if (atRoot) {
          // no need to throw it to the error boundary
          router.change(newLocation, false);
        } else {
          throw new RouteChangeInterruption('Rendering interrupted by route change', newLocation);
        }
      }
      pushOverride = undefined;
    }
  };
  const pCopy = clone(router.parts);
  const qCopy = clone(router.query);
  const onMutation = (pushDefault) => {
    const url = createURL(router, pCopy, qCopy);
    if (!state.rendering) {
      if (url.href !== router.location.href) {
        newLocation = url;
        if (!push) {
          push = pushOverride ?? pushDefault;
        }
        if (!scheduled) {
          Promise.resolve().then(() => {
            scheduled = false;
            if (newLocation) {
              router.change(newLocation, push);
            }
          });
          scheduled = true;
        }
      } else {
        newLocation = undefined;
        push = undefined;
      }
    } else {
      if (pushOverride === false) {
        if (url.href !== router.location.href) {
          newLocation = url;
        } else {
          newLocation = undefined;
        }
      } else {
        throw new Error('Use of replacing() is required in this context');
      }
    }
  };
  const parts = createProxy(pCopy, pOps, state, onMutation, true);
  const query = createProxy(qCopy, qOps, state, onMutation, false);
  const throw404 = () => { throw new RouteError(router.location) };
  return [ parts, query, { throw404, pushing, replacing } ];
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

const SymbolUnderlying = Symbol('underlying');

function createProxy(object, ops, state, onMutation, pushing) {
  const throwError = () => {
    const { rendering, error } = state;
    if (rendering && error) {
      // an error occurred somewhere in the tree
      // throw it (at the root level) to let the catch block deal with it
      throw error;
    }
  };
  const mutatingFns = mutatingFunctionMap.get(object.constructor);
  return new Proxy(object, {
    get(object, name) {
      if (name === SymbolUnderlying) {
        return object;
      }
      throwError();
      const value = object[name];
      if (typeof(value) === 'function') {
        // return a function that call the array's method and log the operation
        return function(...args) {
          const fn = function() { return value.apply(this, args) };
          const result = fn.call(object);
          if (state.rendering) {
            // log the function call
            ops.push({ fn, result });
          }
          if (mutatingFns.includes(name)) {
            onMutation(pushing);
          }
          return result;
        };
      } else {
        // log the retrieval operation
        if (state.rendering) {
          // log the retrieval
          ops.push({ name, result: value })
        }
        return value;
      }
    },
    set(object, name, value) {
      throwError();
      object[name] = '' + value;
      onMutation(pushing);
      return true;
    },
    deleteProperty(object, name) {
      throwError();
      delete object[name];
      onMutation(pushing);
      return true;
    },
  });
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

function parseParts(path, basePath, trailingSlash) {
  if (!path.startsWith(basePath)) {
    throw new Error(`"${path}" does not start with "${basePath}"`);
  }
  const parts = path.substr(basePath.length).split('/');
  if (parts[parts.length - 1] === '') {
    parts.pop();
  }
  parts.trailer = (trailingSlash) ? '/' : '';
  return parts;
}

function parseQuery(searchParams) {
  const query = {};
  for (const [ name, value ] of searchParams) {
    query[name] = value;
  }
  return query;
}

function createURL(router, parts, query) {
  const { location, basePath, parts: { trailer } } = router;
  const path = parts.join('/') + (parts.length > 0 ? trailer : '');
  const url = new URL(basePath + path, location);
  const { searchParams } = url;
  for (const [ name, value ] of Object.entries(query)) {
    searchParams.append(name, value);
  }
  return url;
}

function clone(object) {
  if (object instanceof Array) {
    return [ ...object ];
  } else {
    return { ...object };
  }
}
