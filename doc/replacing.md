# replacing(cb)

Use [`replaceState`](https://developer.mozilla.org/en-US/docs/Web/API/History/replaceState) when path parts are changed

## Syntax

```js
  replacing(() => {
    parts[0] = 'categories';
    parts[1] = 17;
  });
```

## Parameters

* `cb` - `<Function>` Callback function that makes changes to `parts` and `query`
