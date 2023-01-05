# detour(parts = [], query = {}, push = true)

Jump to a different location as though a link has been clicked

## Syntax

```js
  const onClick = useCallback(() => {
    detour([ 'home' ]);
  }, [ detour ]);
```

## Parameters

* `parts` - `<string[]>` The new path parts
* `query` - `<object>` The new set of query variables
* `push` - `<boolean>` Whether the operation should result in a call to `pushState` or a `replaceState`

## Notes

Calling this function will trigger [detour traps](./trap.md).
