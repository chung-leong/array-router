# useSequentialRouter([options])

Create a router suitable for async operation

## Syntax

```js
export default function App() {
  const [ parts, query, rMethods, { createContext, createBoundary } ] = useSequentialRouter();
  return createContext(useSequential(async function*({ wrap }) {
    wrap(children => createBoundary(children));
    /* ... */
  }, [ parts, query, rMethods, createBoundary ]));
}
```

## Parameters

* `options` - `<Object>` Object containing router options

## Options

* `basePath` - `<string>` The base path of the app (default: `'/'`)
* `location` - `<string>` or `<URL>` The initial location (default: `globalThis.location`)
* `trailingSlash` - `<boolean>` Whether URLs should end with a trailing slash (default: `false`)
* `transitionLimit` - `<number>` Maximum transition time in millisecond (default: 100)

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

## Notes

Unlike [`useRouter`](./useRouter.md), `useSequentialRouter` does not trigger component updates. The async code is
expected to deal with changes it makes on its own and capture detour events using [`trap`](./trap.md).

`transitionLimit` would only affect child components that use `useRoute`.

Designed to work with [React-seq](https://github.com/chung-leong/react-seq).
