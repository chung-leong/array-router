# useRoute()

Make use of a router created further up the component tree.

## Syntax

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

## Return value

An array containing path parts, an object containing query variables, an object holding methods of the hook.

## Methods

* [`pushing`](./pushing.md) - Use `pushState` when query variables are changed
* [`replacing`](./replacing.md) - Use `replaceState` when path parts are changed
* [`rethrow`](./rethrow.md) - Throw error caught at error boundary
* [`throw404`](./throw404.md) - Throw RouteError
* [`trap`](./trap.md) - Capture errors or detour events
* [`detour`](./detour.md) - Jump to a different location as though a link has been clicked
* [`isDetour`](./isDetour.md) - Return true if the error object is an instance of `RouteChangePending`
