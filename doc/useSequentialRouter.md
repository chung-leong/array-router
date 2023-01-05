# useSequentialRouter([options])

## Syntax


## Parameters

* `options` - `<Object>` Object containing router options

## Options

* `basePath` - `<string>` The base path of the app (default: `'/'`)
* `location` - `<string>` or `<URL>` The initial location (default: `globalThis.location`)
* `trailingSlash` - `<boolean>` Whether URLs should end with a trailing slash (default: `false`)
* `transitionLimit` - `<number>` Maximum transition time in millisecond (default: 50)

## Return value

An array holding `parts`, `query`, `methods`, and `creationMethods`.

## Methods

* [`pushing`](./pushing.md) - Use `pushState` when query variables are changed
* [`replacing`](./replacing.md) - Use `replaceState` when path parts are changed
* [`rethrow`](./rethrow.md) - Throw error caught at error boundary
* [`throw404`](./throw404.md) - Throw RouteError
* [`trap`](./trap.md) - Capture errors or detour events
* [`detour`](./detour.md) - Jump to a different location as though a link has been clicked
* [`isDetour`](./isDetour.md) - Return true if the error object is an instance of `RouteChangePending`

## Creation methods

* `createContext` - Create a router context provider
* `createBoundary` - Create an error boundary
