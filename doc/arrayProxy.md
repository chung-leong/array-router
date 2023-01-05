# arrayProxy(array, descriptors)

Create a proxy that lets you reference items in an array by name

## Syntax

```js
  const route = arrayProxy(parts, {
    screen: 0,
    id: 1,
  });
  if (route.screen === 'products') {
    if (route.id) {
      return <ProductPage id={route.id} />;
    } else {
      return <ProductList />;
    }
  }
```

## Parameters

* `array` - `<Array>` The target array
* `descriptors` - `<Object>` Property descriptors

## Return value

A [JavaScript proxy object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy).
