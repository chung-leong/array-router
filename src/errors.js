export class RouteError extends Error {
  constructor(url, parts, query) {
    super(`Page not found: ${url.pathname}`);
    this.url = url;
    this.parts = parts;
    this.query = query;
    this.status = 404;
    this.statusText = 'Not Found';
    this.newParts = null;
    this.newQuery = null;
    this.redirected = false;
  }

  redirect(parts = [], query = {}) {
    this.newParts = parts;
    this.newQuery = query;
    this.redirected = true;
  }
}

export class RouteChangeInterruption extends Error {
  constructor(url) {
    super('Rendering interrupted by route change');
    this.url = url;
  }
}

export class RouteChangePending extends Error {
  constructor(url, parts, query, reason, source, internal = true) {
    super(`Detouring to ${url} (${reason})`);
    this.url = url;
    this.parts = parts;
    this.query = query;
    this.reason = reason;
    this.source = source;
    this.internal = internal;
    this.promise = new Promise((r1, r2) => {
      this.resolve = r1;
      this.reject = r2;
    });
    this.all = null;
    this.onSettlement = null;
  }

  async proceed() {
    this.resolve();
    this.onSettlement?.();
    // await decisions of all other traps
    await this.all;
  }

  prevent() {
    this.onSettlement?.();
    this.reject(new Error('Detour rejected'));
  }
}
