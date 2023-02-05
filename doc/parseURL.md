# parseURL(currentURL, url, options)

Extract path parts and query variables from a URL

## parameters

* `currentURL` - `<URL>` Current location
* `url` - `<boolean>` URL from which to extract parts and query
* `options` - `<Object>` Router options
* `return` `{ parts: <string[]>, query: { [key]: <string> } }`

## Notes

Use `setCoercionMethod` on `part` and `query` if they can only contain strings. Example: 

```js
  const parts = url.pathname.substr(1).split('/');
  const query = {};
  for (const [ name, value ] of searchParams) {
    query[name] = value;
  }
  const toString = s => s + '';
  setCoercionMethod(parts, toString);
  setCoercionMethod(query, toString);
```

Doing so ensures that these objects will not momentarily contain values of the incorrect 
type:

```js
  parts[1] = 5;
  // parts[1] will be "5" not 5 due to type coercion
```
