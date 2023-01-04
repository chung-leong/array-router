# Array-router ![ci](https://img.shields.io/github/actions/workflow/status/chung-leong/array-router/node.js.yml?branch=main&label=Node.js%20CI&logo=github) ![nycrc config on GitHub](https://img.shields.io/nycrc/chung-leong/array-router)

Array-route is a simple, light-weight library that helps you manage routes in your React application.

## Syntax

App.js
```js
import { useRouter } from 'array-router';
/* ... */
export default function App() {
  const provide = useRouter();
  return (
    <div className="App">
      {provide((parts, query, { throw404 }) => {
        try {
          switch (parts[0]) {
            case undefined:
              return <WelcomePage />
            case 'categories':
              return <CategoryPage />
            case 'forums':
              return <ForumPage />
            default:
              throw404();
          }
        } catch (err) {
          return <ErrorPage error={err} />
        }
      })}
    </div>
  );
}
```

CategoryPage.js
```js
export default function CategoryPage() {
  const [ parts, query ] = useRoute();
  const categoryId = parts[1];
  return (
    /* ... */
  );
}
```

## Basic design

Array-router does not actually provide any routing logic. Instead, it gives you an `Array` containing
`pathname.split('/')` and an `Object` containing values from `searchParams`. You can then use them to build out
a routing scheme that suits the needs of your app.

The aforementioned array and object are
<a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy">JavaScript proxy
objects</a>. Array-router tracks all actions you perform on them and takes appropriate actions based on this
information. In the above example, Array-router knows that `App` reads the first item when it renders while
`CategoryPage` reads the second. If the location changes from `/categories/1` to `/categories/2`, Array-router will
ask `CategoryPage` to rerender but not `App` since only `parts[1]` is different.

Mutation of `parts` or `query` will cause the location to change. For instance, `parts.push('product', 17)` would move
you from `/categories/1` to `/categories/1/product/17`. Conversely, `parts.pop()` would send you from `/categories/1`
to `/categories` while `parts.splice(0)` would send you all the way back to the root level.

## Override default push vs. replace behavior

By default, changes to `parts` trigger calls to
[`pushState`](https://developer.mozilla.org/en-US/docs/Web/API/History/pushState) while changes to `query` trigger
calls to [`replaceState`](https://developer.mozilla.org/en-US/docs/Web/API/History/replaceState). When both type of
changes occur, `pushState` has precedence.

You can use `replacing` to indicate that changes made to the path should lead to a `replaceState` instead of
the default `pushState`:

```js
  replacing(() => {
    parts[0] = 'categories';
    parts[1] = 17;
  });
```

Conversely, you can use `pushing` to force the use of `pushState` when query variables are changes:

```js
  pushing(() => query.search = evt.target.value);
```

## Changing route during rendering

Normally, you would make changes to `parts` or `query` inside an event handler. You can change them while a component
is rendering if you must. To do so, you need to use replacing:

```js
function ProjectPage() {
  const [ parts, query, { replacing } ] = useRoute();
  if (parts[1] === 'summary') {
    // from an outdated URL
    replacing(() => parts[1] = 'overview');
  }
  /* ... */
}
```

`replacing` will throw a `RouteChangeInterruption` error. When the router receives this error from its error boundary,
the changes will be applied. The error boundary's attempt at reconstructing the component will subsequently proceed
without incident.

This behavior is applicable to consumers of `useRoute` only. At the root level, changes get applied immediately.

## Error handling

Array-router provides an [error boundary](https://reactjs.org/docs/error-boundaries.html) that redirect
errors to the root. A captured error is rethrown the moment your code accesses one of the proxies (`parts` or `query`)
or when `rethrow` is called.

## Array proxy

## useRouter([options])

### Syntax

```js
export default function App() {
  const provide = useRouter();
  return (
    <div className="App">
      {provide((parts, query, { throw404 }) => {
        try {
          switch (parts[0]) {
            case undefined:
              return <WelcomePage />
            case 'categories':
              return <CategoryPage />
            case 'forums':
              return <ForumPage />
            default:
              throw404();
          }
        } catch (err) {
          return <ErrorPage error={err} />
        }
      })}
    </div>
  );
}
```

### Parameters

* `options` - `<Object>` Object containing router options

### Return value

A function with three arguments: `parts`, `query`, and `methods`. These are the same as the
objects returned by [`useRoute`](#useRoute).

### Options

* `basePath` - `<string>` The base path of the app (default: `'/'`)
* `location` - `<string>` or `<URL>` The initial location (default: `globalThis.location`)
* `trailingSlash` - `<boolean>` Whether URLs should end with a trailing slash (default: `false`)
* `transitionLimit` - `<number>` Maximum transition time in millisecond (default: 50)

### Methods

* `pushing(cb)` - Use `pushState` when query variables are changed
* `replacing(cb)` - Use `replaceState` when path parts are changed
* `rethrow()` - Throw error caught at error boundary
* `throw404()` - Throw RouteError
* `trap(type, cb)` - Capture errors or detour events
* `detour(parts = [], query = {}, push = false)` - Jump to a different location as though a link has been clicked
* `isDetour(err)` - Return true if the error object is an instance of `RouteChangePending`

## useRoute()

Make use of a router created further up the component tree.

### Syntax

```js
export default function CategoryPage() {
  const [ parts, query, { replacing } ] = useRoute();
  const categoryId = parts[1];

  const onClick = (evt) => useCallback(() => {
    replacing(() => parts[1] = evt.value);
  }, [ replacing ]);

  return (
    /* ... */
  );
}
```

### Return value

An array containing path parts, an object containing query variables, an object holding methods of the hook.

### Methods

* `pushing(cb)` - Use `pushState` when query variables are changed
* `replacing(cb)` - Use `replaceState` when path parts are changed
* `rethrow()` - Throw error caught at error boundary
* `throw404()` - Throw RouteError
* `trap(type, cb)` - Capture errors or detour events
* `detour(parts = [], query = {}, push = false)` - Jump to a different location as though a link has been clicked
* `isDetour(err)` - Return true if the error object is an instance of `RouteChangePending`

## useLocation()

Return the current location

### Syntax

```js
export default function LocationBar() {
  const url = useLocation();
  return <span>{url}</span>;
}
```

### Return value

An [`URL`](https://developer.mozilla.org/en-US/docs/Web/API/URL) object.

## useSequentialRouter([options])

### Syntax

### Return value

An array holding `parts`, `query`, `methods`, and `creationMethods`.

### Methods

* `pushing(cb)` - Use `pushState` when query variables are changed
* `replacing(cb)` - Use `replaceState` when path parts are changed
* `rethrow()` - Throw error caught at error boundary
* `throw404()` - Throw RouteError
* `trap(type, cb)` - Capture errors or detour events
* `detour(parts = [], query = {}, push = false)` - Jump to a different location as though a link has been clicked
* `isDetour(err)` - Return true if the error object is an instance of `RouteChangePending`

### Creation methods

* `createContext(children)` - Create a router context provider around the given element
* `createBoundary(children)` - Create an error boundary around the given element

## arrayProxy()
