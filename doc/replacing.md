# replacing(cb)

Use `replaceState` when path parts are changed

## Syntax

```js
  replacing(() => {
    parts[0] = 'categories';
    parts[1] = 17;
  });
```

## Parameters

* `cb` - `<Function>` Callback function that makes changes to `parts` and `query`
