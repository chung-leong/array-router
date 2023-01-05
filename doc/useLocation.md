# useLocation()

Return the current location

## Syntax

```js
export default function LocationBar() {
  const url = useLocation();
  return <span>{url}</span>;
}
```

## Return value

An [`URL`](https://developer.mozilla.org/en-US/docs/Web/API/URL) object.
