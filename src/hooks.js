import { useMemo, useReducer, useState, useCallback, useEffect, useInsertionEffect, useContext, useTransition,
  createContext, createElement } from 'react';
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
  startTransition = null;
  onUpdate = null;
  on404 = null;

  constructor({ location, basePath, trailingSlash, onUpdate, on404 }) {
    this.basePath = basePath;
    this.trailer = (trailingSlash) ? '/' : '';
    this.onUpdate = onUpdate;
    this.on404 = on404;
    const url = new URL(location ?? globalThis.location); // eslint-disable-line no-undef
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
      this.startTransition(() => {
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
      window.addEventListener('click', onLinkClick, true);
      window.addEventListener('popstate', onPopState, true);
      return () => {
        window.removeEventListener('click', onLinkClick, true);
        window.removeEventListener('popstate', onPopState, true);
      };
    }
  }
}

class RouteComponent {
  static mutatingFunctions = new Map([
    [ Array, [ 'copyWithin', 'fill', 'pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift' ] ],
    [ Object, [] ],
  ]);

  constructor(source) {
    this.source = source;
    this.shadow = null;
    this.ops = [];
    this.proxy = new Proxy(source, {
      get: (_, name) => this.get(name),
      set: (_, name, value) => this.set(name, value),
      deleteProperty: (_, name) => this.delete(name)
    });
    this.mutatingFns = RouteComponent.mutatingFunctions.get(source.constructor);
  }

  get(name) {
    this.onAccess?.();
    let object = this.current();
    const value = object[name];
    if (typeof(value) === 'function') {
      // return a function that call the array's method and log the operation
      const self = this;
      return function(...args) {
        const fn = function() { return value.apply(this, args) };
        const mutating = self.mutatingFns.includes(name);
        if (mutating) {
          // function is going to mutate the object, need to use a copy
          object = self.copy();
        }
        const result = fn.call(object);
        if (mutating) {
          self.onMutation?.();
        } else {
          // log the function call
          self.ops.push({ fn, result });
        }
        return result;
      };
    } else {
      // log the retrieval
      this.ops.push({ name, result: value })
      return value;
    }
  }

  set(name, value) {
    this.onAccess?.();
    const object = this.copy();
    object[name] = '' + value;
    this.onMutation?.();
    return true;
  }

  delete(name) {
    this.onAccess?.();
    const object = this.copy();
    delete object[name];
    this.onMutation?.();
    return true;
  }

  current() {
    return this.shadow ?? this.source;
  }

  copy() {
    if (!this.shadow) {
      this.shadow = clone(this.source);
    }
    return this.shadow;
  }

  clear() {
    this.shadow = null;
    this.ops = [];
  }
}

class RouteController {
  router = null;
  atRoot = false;
  parts = null;
  query = null;
  push = undefined;
  pushOverride = undefined;
  newLocation = null;
  scheduled = false;
  rendering = false;

  constructor(router, atRoot) {
    const self = this;
    this.router = router;
    this.atRoot = atRoot;
    this.parts = new RouteComponent(router.parts);
    this.query = new RouteComponent(router.query);
    this.parts.onAccess = this.query.onAccess = function() {
      // at the root level, touching the proxies will cause the last error to be thrown during rendering
      if (self.atRoot && self.rendering && self.router.lastError) {
        throw self.router.lastError;
      }
    };
    this.parts.onMutation = this.query.onMutation = function() {
      self.mutate(this);
    };
  }

  onRenderStart() {
    this.parts.clear();
    this.query.clear();
    this.rendering = true;
  }

  onRenderEnd() {
    this.rendering = false;
  }

  mutate(comp) {
    const pushDefault = (comp === this.parts) ? true : false;

    // we're rendering; changes need to be made by replacing
    if (this.rendering && this.pushOverride !== false) {
      throw new Error('Use of replacing() is required in this context');
    }

    const parts = this.parts.current(), query = this.query.current();
    this.newLocation = this.router.createURL(parts, query);
    if (this.router.location.href !== this.newLocation.href) {
      // if the changes create a different URL, then we use push for the upcoming operation
      if (!this.push) {
        this.push = this.pushOverride ?? pushDefault;
      }
    } else {
      // the URL got changed back to what it was, clear the push disposition
      this.push = undefined;
      this.newLocation = undefined;
    }
    if (!this.scheduled) {
      // perform the change on the next tick
      Promise.resolve().then(() => {
        if (this.newLocation) {
          this.router.change(this.newLocation, this.push);
        }
        // clear the copies used by the proxies, at this point the router's copy
        // should include the changes made by the proxies
        this.parts.clear();
        this.query.clear();
        this.newLocation = undefined;
        this.push = undefined;
        this.scheduled = false;
      });
      this.scheduled = true;
    }
  }

  replacing = (fn) => {
    if (this.pushOverride !== undefined) {
      throw new Error('Cannot use replacing() in this context');
    }
    try {
      this.pushOverride = false;
      fn();
      if (this.rendering && this.newLocation) {
        // since we're rendering already, changes need to occur now
        const url = this.newLocation;
        this.newLocation = undefined;
        if (url.href !== this.router.location.href) {
          if (this.atRoot) {
            this.router.change(url, false);
          } else {
            throw new RouteChangeInterruption('Rendering interrupted by route change', url);
          }
        }
      }
    } finally {
      this.pushOverride = undefined;
    }
  }

  pushing = (fn) => {
    if (this.rendering || this.pushOverride !== undefined) {
      throw new Error('Cannot use pushing() in this context');
    }
    try {
      this.pushOverride = true;
      fn();
    } finally {
      this.pushOverride = undefined;
    }
  }

  rethrow = () => {
    if (this.router.lastError) {
      throw this.router.lastError;
    }
  }

  throw404 = () => {
    throw new RouteError(this.router.location);
  }
}

export function useRouter(options = {}) {
  const {
    basePath = '/',
    location,
    trailingSlash = false,
    allowExtraParts = false,
    transitionLimit = 50,
    keepExtraQuery = [],
    on404,
  } = options;
  if (!basePath.endsWith('/')) {
    throw new Error('basePath should have a trailing slash');
  }
  const [ count, dispatch ] = useReducer(c => c + 1, 0);
  const router = useMemo(() => {
    return new Router({ location, basePath, trailingSlash, onUpdate: dispatch, on404 });
  }, [ location, basePath, trailingSlash, on404 ]);
  useEffect(() => router.attachListeners(), [ router ]);
  // the root component is also a route consumer, it just receive the route as arguments to
  // provide() instead of getting it as a returned value
  const [ parts, query, methods ] = useRouteFrom(router, dispatch, true);
  const provide = useCallback((cb) => {
    const children = cb(parts, query, methods);
    // transition component
    const transition = createElement(RouterTransition, { router, transitionLimit });
    // inspection component
    const inspection = createElement(RouterInspection, { router, allowExtraParts, keepExtraQuery });
    // catch errors from children so we can redirect it to the root component
    const boundary = createElement(ErrorBoundary, { onError: (err) => router.setError(err) }, children, transition, inspection);
    // provide context to any children using useRoute()
    return createElement(RouterContext.Provider, { value: router }, boundary);
  }, [ methods, router, allowExtraParts, transitionLimit, keepExtraQuery ]);
  return provide;
}

function RouterTransition({ router, transitionLimit }) {
  const [ isPending, startTransition ] = useTransition();
  const [ callback, setCallback ] = useState();
  router.startTransition = (cb) => {
    startTransition(cb);
    setCallback(() => cb);
  };
  useEffect(() => {
    const timeout = (callback && isPending) ? setTimeout(callback, transitionLimit) : 0;
    return () => clearTimeout(timeout);
  }, [ callback, isPending ]);
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
  // track changes make by hook consumer
  const controller = useMemo(() => new RouteController(router, atRoot), [ router ]);
  const { parts, query } = controller;
  // track whether the component is rendering
  controller.onRenderStart();
  useEffect(() => controller.onRenderEnd());
  // monitor route changes; dispatch is invoked only if the ops performed on
  // the route components yield different results with a new route
  const pOps = parts.ops, qOps = query.ops;
  useMonitoring(router, { pOps, qOps, dispatch, atRoot });
  const methods = useMemo(() => {
    const { pushing, replacing, throw404, rethrow } = controller;
    return { pushing, replacing, throw404, rethrow };
  }, [ controller ]);
  return [ parts.proxy, query.proxy, methods ];
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
