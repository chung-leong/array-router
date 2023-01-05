# trap(type, cb)

Capture errors or detour events

## Syntax

```js
  const [ parts, query, { trap } ] = useRouter;
  trap('error', err => {
    setLastError(err);
    parts.splice(0);
    return false;
  })
```

```js
  const [ parts, query, { trap } ] = useRouter;
  trap('detour', err => {
    setTimeout(() => {
      if (confirm('Are you sure you want to leaving this page?')) {
        err.proceed();
      } else {
        err.prevent();
      }
    }, 50);
    return true;
  })
```

## Parameters

* `type` - "error" or "detour"
* `cb` - `<Function>` Callback function

## Notes

A detour trap will only receive [`RouteChangePending`](./RouteChangePending.md) objects. It should
return `true` if it wishes to defer the decision on whether to proceed with the detour.

An error trap should return a boolean if it has handled the error. This disables the default error handling
mechanism. A return value of `true` means the error boundary can attempt to reconstruct the component tree
(i.e. the error is fixed). `false` means the error boundary should render nothing until it's given a new
component tree.
