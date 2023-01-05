# pushing(cb)

Use `pushState` when query variables are changed

## Syntax

```js
  pushing(() => query.search = evt.target.value);
```

## Parameters

* `cb` - `<Function>` Callback function that makes changes to `parts` and `query`
