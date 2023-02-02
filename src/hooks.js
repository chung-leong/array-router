import { useMemo, useReducer, useState, useCallback, useEffect, useContext, useTransition,
  createContext, createElement } from 'react';
import { ErrorBoundary } from './error-boundary.js';
import { RouteError, RouteChangeInterruption, RouteChangePending } from './errors.js';

const RouterContext = createContext();

class Router {
  location = null;
  parts = [];
  query = {};
  consumers = [];
  removed = [];
  lastError = null;
  history = [ { index: 0, href: '' } ];
  historyIndex = 0;
  traps = { detour: [], error: [] };
  currentDetour = null;
  startTransition = null;
  updateRoot = null;

  constructor(options) {
    this.options = options;
    const url = new URL(options.location ?? globalThis.location); // eslint-disable-line no-undef
    this.location = new URL(url.origin.startsWith(url.protocol) ? url.origin : url.protocol);
    this.change(url, false, true);
  }

  updateState(url, push, external) {
    const { parts, query, location, options } = this;
    const newState = this.parseURL(url);
    // copy into existing object
    const pDiff = !compareResult(parts, newState.parts);
    if (pDiff) {
      copyInto(newState.parts, parts);
    }
    const qDiff = !compareResult(query, newState.query);
    if (qDiff) {
      copyInto(newState.query, query);
    }
    if (external) {
      // recreate the URL so it confirms to trailing slash setting
      url = this.createURL(parts, query);
    }
    location.href = url.href;
    if (typeof(push) === 'boolean') {
      const { applyURL } = options;
      const { href } = location;
      const index = this.historyIndex + (push ? 1 : 0);
      const removing = (push) ? this.history.length - index : 1;      
      applyURL?.(location, push, { index });
      this.history.splice(index, removing, { href, index });
      this.historyIndex = index;
    }
    return { pDiff, qDiff };
  }

  parseURL(url) {
    const { location, options } = this;
    const { parseURL } = options;
    return parseURL(location, url, options);
  }

  createURL(parts, query) {
    const { location, options } = this;
    const { createURL } = options;
    return createURL(location, { parts, query }, options);
  }

  change(url, push, external = false) {
    const { location, parts, query } = this;
    const diff = this.updateState(url, push, external);
    this.notifyConsumers(diff);
  }

  reportError(error) {
    if (error instanceof RouteChangeInterruption) {
      // apply the change and return true to indicate that rendering can continue
      this.change(error.url, false);
      return true;
    }
    const result = this.activateErrorTraps(error);
    if (typeof(result) === 'boolean') {
      return result;
    }
    this.lastError = error;
    this.updateRoot?.();
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

  activateDetourTraps(reason, url, source = null, internal = true) {
    if (this.currentDetour) {
      return Promise.reject(new Error('Detour outstanding'));
    }
    const { basePath } = this.options;
    const errors = [];
    const fns = this.traps.detour;
    if (fns.length > 0) {
      const { parts = null, query = null } = (internal) ? this.parseURL(url) : {};
      for (const fn of fns) {
        const err = new RouteChangePending(url, parts, query, reason, source, internal);
        const result = fn(err);
        if (result === true) {
          errors.push(err);
        }
      }
    }
    if (errors.length === 0) {
      return null;
    }
    this.currentDetour = Promise.all(errors.map(e => e.promise));
    for (const err of errors) {
      err.all = this.currentDetour;
    }
    this.currentDetour.then(() => this.currentDetour = null, () => this.currentDetour = null);
    return this.currentDetour;
  }

  activateErrorTraps(error) {
    const fns = this.traps.error;
    if (fns.length > 0) {
      for (const fn of fns) {
        const result = fn(error);
        if (error instanceof RouteError && error.redirected) {
          const url = this.createURL(error.newParts, error.newQuery);
          this.change(url, false);
          return true;
        }
        if (typeof(result) === 'boolean') {
          return result;
        }
      }
    }
  }

  addTraps(traps) {
    for (const [ type, fn ] of Object.entries(traps)) {
      if (fn) {
        const fns = this.traps[type];
        if (fns.indexOf(fn) === -1) {
          fns.push(fn);
        }
      }
    }
  }

  removeTraps(traps) {
    for (const [ type, fn ] of Object.entries(traps)) {
      if (fn) {
        const fns = this.traps[type];
        const index = fns.indexOf(fn);
        if (index !== -1) {
          fns.splice(index, 1);
        }
      }
    }
  }

  attachListeners() {
    if (typeof(window) === 'object') {
      const { location } = this;
      const { basePath } = this.options;
      const onLinkClick = (evt) => {
        const { target, button, defaultPrevented } = evt;
        if (button === 0 && !defaultPrevented) {
          const link = target.closest('A');
          if (link && !link.target && !link.download) {
            const url = new URL(link);
            const internal = (link.origin === location.origin && link.pathname.startsWith(basePath));
            if (!internal || url.pathname !== location.pathname || url.search !== location.search) {
              const promise = this.activateDetourTraps('link', url, link, internal);
              if (internal) {
                if (promise) {
                  promise.then(() => this.change(url, true, true), () => {});
                } else {
                  this.change(url, true, true);
                }
                evt.preventDefault();
              } else {
                if (promise) {
                  promise.then(() => window.location.href = url, () => {});
                  evt.preventDefault();
                }
              }
            }
          }
        }
      };
      let resolve = null;
      const onPopState = (evt) => {
        if (resolve) {
          resolve();
          resolve = null;
          return;
        }
        const { history } = window;
        const { index } = history.state;
        const url = new URL(window.location)
        const delta = index - this.historyIndex;
        const direction = (delta > 0) ? 'forward' : 'back';
        const promise = this.activateDetourTraps(direction, url);
        if (promise) {
          function revert(delta) {
            history.go(delta);
            return new Promise(r => resolve = r);
          }
          // change the URL back if the change isn't immediately approved
          let reversion;
          let timeout = setTimeout(() => reversion = revert(-delta), 0);
          promise.then(() => {
            this.historyIndex = index;
            clearTimeout(timeout);
            this.change(url);
            // apply the change if it got reverted
            reversion?.then(() => revert(delta));
          }, (err) => {});
        } else {
          this.historyIndex = index;
          this.change(url);
        }
      };
      window.addEventListener('click', onLinkClick, true);
      window.addEventListener('popstate', onPopState, true);
      return () => {
        window.removeEventListener('click', onLinkClick, true);
        window.removeEventListener('popstate', onPopState, true);
      };
    }
  }

  createContext = (children) => {
    const { transitionLimit } = this.options;
    const transition = createElement(RouterTransition, { router: this, transitionLimit });
    return createElement(RouterContext.Provider, { value: this }, transition, children);
  }

  createBoundary = (children) => {
    return createElement(ErrorBoundary, { onError: (err) => this.reportError(err) }, children);
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
        const mutating = self.mutatingFns.includes(name);
        const coerce = (mutating) ? getCoercionMethod(self.source) : null;
        const fn = function() { 
          const result = value.apply(this, args);
          if(coerce) {
            apply(coerce, this);
          }
          return result;
        };
        if (mutating) {
          // function is going to mutate the object, need to use a copy
          object = self.copy();
        }
        const result = fn.call(object);
        if (mutating) {
          self.onMutation?.();
        } else {
          // log the function call
          self.log({ fn, result });
        }
        return result;
      };
    } else {
      // log the retrieval
      this.log({ name, result: value })
      return value;
    }
  }

  set(name, value) {
    this.onAccess?.();
    const object = this.copy();
    const coerce = getCoercionMethod(this.source);
    object[name] = (coerce) ? coerce(value) : value;
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

  log(op) {
    this.ops.push(op);
    if (this.ops.length > 1000) {
      throw new Error('Infinite loop detected');
    }
  }

  clearShadow() {
    this.shadow = null;
  }

  clearOps() {
    this.ops.splice(0);
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
  traps = {};

  constructor(router, atRoot) {
    this.router = router;
    this.atRoot = atRoot;
    this.parts = new RouteComponent(router.parts);
    this.query = new RouteComponent(router.query);
    const self = this;
    this.parts.onAccess = this.query.onAccess = function() {
      self.throw();
    };
    this.parts.onMutation = this.query.onMutation = function() {
      self.mutate(this);
    };
  }

  onRenderStart() {
    this.parts.clearOps();
    this.query.clearOps();
    this.rendering = true;
  }

  onRenderEnd() {
    this.rendering = false;
  }

  throw() {
    // at the root level, touching the proxies will cause the last error to be thrown during rendering
    if (this.atRoot && this.rendering && this.router.lastError) {
      throw this.router.lastError;
    }
  }

  mutate(comp) {
    // we're rendering; changes need to be made by replacing
    if (this.rendering && this.pushOverride !== false) {
      throw new Error('Use of replacing() is required in this context');
    }

    const parts = this.parts.current(), query = this.query.current();
    this.newLocation = this.router.createURL(parts, query);
    if (this.router.location.href !== this.newLocation.href) {
      // if the changes create a different URL, then we use push for the upcoming operation
      if (!this.push) {
        // default for path changes is push
        const pushDefault = (comp === this.parts) ? true : false;
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
        this.parts.clearShadow();
        this.query.clearShadow();
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
            throw new RouteChangeInterruption(url);
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
    const { location, parts, query } = this.router;
    throw new RouteError(location, parts, query);
  }

  trap = (type, fn) => {
    if (type !== 'detour' && type !== 'error') {
      throw new Error(`Unknown trap type: ${type}`);
    }
    this.router.removeTraps(this.traps);
    this.traps[type] = fn;
    this.router.addTraps(this.traps);
  }

  detour = async (parts = [], query = {}, push = true) => {
    try {
      const url = this.router.createURL(parts, query);
      await this.router.activateDetourTraps('link', url);
      this.router.change(url, push, false);
      return true;
    } catch (err) {
      return false;
    }
  }

  isDetour = (err) => {
    return (err instanceof RouteChangePending);
  }
}

function RouterTransition({ router, transitionLimit }) {
  const [ isPending, startTransition ] = useTransition();
  const [ callback, setCallback ] = useState();
  const [ mounted, setMounted ] = useState(false);
  router.startTransition = (cb) => {
    if (mounted) {
      startTransition(cb);
      setCallback(() => cb);
    } else {
      cb();
    }
  };
  useEffect(() => {
    setMounted(true);
    return () => {
      setMounted(false)
    };
  }, []);
  useEffect(() => {
    const timeout = (callback && isPending) ? setTimeout(callback, transitionLimit) : 0;
    return () => clearTimeout(timeout);
  }, [ callback, isPending, transitionLimit ]);
  return null;
}

export function useRouter(options) {
  options = useRouterOptions(options);
  const router = useMemo(() => new Router(options), [ options ]);
  const [ , dispatch ] = useReducer(c => c + 1, 0);
  router.updateRoot = dispatch;
  useEffect(() => router.attachListeners(), [ router ]);
  // the root component is also a route consumer, it just receive the route as arguments to
  // provide() instead of getting it as a returned value
  const [ parts, query, methods ] = useRouteFrom(router, dispatch, true);
  const provide = useCallback((cb) => {
    const children = cb(parts, query, methods);
    // transition component
    const boundary = router.createBoundary(children);
    // provide context to any children using useRoute()
    return router.createContext(boundary);
  }, [ parts, query, methods, router ]);
  return provide;
}

export function useRoute() {
  const router = useRouterContext();
  const [ , dispatch ] = useReducer(c => c + 1, 0);
  return useRouteFrom(router, dispatch);
}

export function useLocation() {
  const router = useRouterContext();
  const [ , dispatch ] = useReducer(c => c + 1, 0);
  useEffect(() => {
    const consumer = { lOps: true, dispatch };
    router.addConsumer(consumer);
    return () => {
      router.removeConsumer(consumer);
    };
  }, [ router ]);
  return router.location;
}

export function useSequentialRouter(options) {
  options = useRouterOptions(options);
  const router = useMemo(() => new Router(options, true), [ options ]);
  useEffect(() => router.attachListeners(), [ router ]);
  // track changes make by hook consumer
  const controller = useMemo(() => new RouteController(router, false), [ router ]);
  const { parts, query } = controller;
  const dispatch = useCallback(() => {
    controller.onRenderStart();
    controller.onRenderEnd();
  }, [ controller ]);
  useEffect(() => {
    const pOps = parts.ops, qOps = query.ops;
    const consumer = { pOps, qOps, dispatch, atRoot: false };
    router.addConsumer(consumer);
    router.addTraps(controller.traps);
    return () => {
      router.removeConsumer(consumer);
      router.removeTraps(controller.traps);
    };
  }, [ parts, query, router, dispatch, controller ]);
  const methods1 = useMemo(() => {
    const { pushing, replacing, throw404, rethrow, trap, detour, isDetour } = controller;
    return { pushing, replacing, throw404, rethrow, trap, detour, isDetour };
  }, [ controller ]);
  const methods2 = useMemo(() => {
    const { createContext, createBoundary } = router;
    return { createContext, createBoundary };
  }, [ router ])
  return [ parts.proxy, query.proxy, methods1, methods2 ];
}

function useRouterOptions(options = {}) {
  const {
    basePath = '/',
    location,
    trailingSlash = false,
    transitionLimit = 100,
    createURL = createWebURL,
    parseURL = parseWebURL,
    applyURL = (typeof(window) === 'object') ? applyWebURL : null,
  } = options;
  if (!basePath.endsWith('/')) {
    throw new Error('basePath should have a trailing slash');
  }
  return useMemo(() => {
    return { location, basePath, trailingSlash, transitionLimit, createURL, parseURL, applyURL };
  }, [ location, basePath, trailingSlash, transitionLimit ]);
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
  const controller = useMemo(() => new RouteController(router, atRoot), [ router, atRoot ]);
  const { parts, query } = controller;
  // track whether the component is rendering
  controller.onRenderStart();
  useEffect(() => controller.onRenderEnd());
  // monitor route changes; dispatch is invoked only if the ops performed on
  // the route components yield different results with a new route;
  useEffect(() => {
    const pOps = parts.ops, qOps = query.ops;
    const consumer = { pOps, qOps, dispatch, atRoot };
    router.addConsumer(consumer);
    router.addTraps(controller.traps);
    return () => {
      router.removeConsumer(consumer);
      router.removeTraps(controller.traps);
    };
  }, [ parts, query, router, controller, dispatch, atRoot ]);
  const methods = useMemo(() => {
    const { pushing, replacing, throw404, rethrow, trap, detour, isDetour } = controller;
    return { pushing, replacing, throw404, rethrow, trap, detour, isDetour };
  }, [ controller ]);
  return [ parts.proxy, query.proxy, methods ];
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
    } else if (typeof(a) === 'object' && typeof(b) === 'object') {
      const aKeys = Object.keys(a), bKeys = Object.keys(b);
      if (aKeys.length !== bKeys.length) {
        return false;
      }
      for (const key of aKeys) {
        if (a[key] !== b[key]) {
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

function apply(method, object) {
  if (object instanceof Array) {
    for (let i = 0; i < object.length; i++) {
      object[i] = method(object[i]);
    }
  } else {
    for (const key in object) {
      object[key] = method(object[key]);
    }
  }
}

const coercionMethods = new WeakMap();

function getCoercionMethod(object) {
  return coercionMethods.get(object);
}

export function setCoercionMethod(object, fn) {
  coercionMethods.set(object, fn);
  getCoercionMethod(object);
}

function copyInto(a, b) {
  // copy the coercion method as well
  setCoercionMethod(b, getCoercionMethod(a));
  if (b instanceof Array) {
    b.splice(0, b.length, ...a);
  } else {
    for (const key of Object.keys(b)) {
      delete b[key];
    }
    Object.assign(b, a);
  }
}

function toString(v) {
  return v + '';
}

function parseWebURL(currentURL, { pathname, searchParams }, { basePath }) {
  if (!pathname.startsWith(basePath)) {
    throw new Error(`"${pathname}" does not start with "${basePath}"`);
  }
  const parts = pathname.substr(basePath.length).split('/');
  if (parts[parts.length - 1] === '') {
    parts.pop();
  }
  const query = {};
  for (const [ name, value ] of searchParams) {
    query[name] = value;
  }
  // parts and query can only contain strings
  setCoercionMethod(parts, toString);
  setCoercionMethod(query, toString);
  return { parts, query };
}

function createWebURL(currentURL, { parts, query }, { trailingSlash, basePath }) {
  const path = parts.join('/') + (parts.length > 0 ? (trailingSlash ? '/' : '') : '');
  const url = new URL(basePath + path, currentURL);
  const { searchParams } = url;
  for (const [ name, value ] of Object.entries(query)) {
    searchParams.append(name, value);
  }
  return url;
}

function applyWebURL(currentURL, push, state) {
  const { history } = window;
  const { href } = currentURL;
  if (push) {
    history.pushState(state, undefined, href);
  } else {
    history.replaceState(state, undefined, href);
  }
}