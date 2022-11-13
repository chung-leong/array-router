export class RouteError extends Error {
  constructor(url) {
    super(`Page not found: ${url.pathname}`);
    this.origin = url.origin;
    this.pathname = url.pathname;
    this.status = 404;
    this.statusText = 'Not Found';
  }
}

export class RouteChangeInterruption extends Error {
  constructor(message, url) {
    super(message);
    this.url = url;
  }
}
