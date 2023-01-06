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

* `array` - `<string[]>` The target array
* `descriptors` - `<Object>` Property descriptors

## Return value

A [JavaScript proxy object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy).

## Simple descriptors

Each entries in `descriptors` represents a property in the resultant proxy. The simplest descriptor is a number:

```js
const descriptors = {
  screen: 0,
  id: 1,
};
console.log({ ...arrayProxy([ 'products', '15' ], descriptors) });
```

Results:
```js
{ screen: 'products', id: '15' }
```

## Complex descriptors

A common URL scheme screen on the web is `/[object type]/[object id]`:

```
/articles/2174
/categories/5/products/112
/forums/9/threads/44/messages/20883
```

To describe a property that requires the presence of a static strings in another array position, use a object
descriptor:

```js
{
  articleId: { "articles": 0, $: 1 },
}
```

The dollar sign tells `arrayProxy` the property's value is located in position 1, while the element at 0
needs to be "articles". If the string is not there, then the property does not exist.

Example:

```js
const descriptors = {
  articleId: { "articles": 0, $: 1 },
  categoryId: { "categories": 0, $: 1 },
  forumId: { "forums": 0, $: 1 },
  productId: { "products": 2, $: 3 },
  threadId: { "threads": 2, $: 3 },
  messageId: { "messages": 4, $: 5 },
};
console.log({ ...arrayProxy([ 'articles', '2174' ], descriptors) });
console.log({ ...arrayProxy([ 'categories', '5' , 'products', '112' ], descriptors) });
console.log({ ...arrayProxy([ 'forums', '9', 'threads', '44', 'messages', '20883' ], descriptors) });
```

Output:

```js
{ articleId: '2174' }
{ categoryId: '5', productId: '112' }
{ forumId: '9', threadId: '44', messageId: '20883' }
```

Add `...removing` to a descriptor if you want parts coming after the property removed when a value is assigned
to the property:

```js
import { arrayProxy, removing } from '../index.js';

const descriptors = {
  articleId: { "articles": 0, $: 1, ...removing },
  categoryId: { "categories": 0, $: 1, ...removing },
  forumId: { "forums": 0, $: 1, ...removing },
  productId: { "products": 2, $: 3, ...removing },
  threadId: { "threads": 2, $: 3, ...removing },
  messageId: { "messages": 4, $: 5, ...removing },
};
const parts = [ 'categories', '5' , 'products', '112' ];
const proxy = arrayProxy(parts, descriptors)
console.log('Before:');
console.log({ ...proxy }, parts);
proxy.articleId = 88;
console.log('After:');
console.log({ ...proxy }, parts);
```

Output:
```js
Before:
{ categoryId: '5', productId: '112' } [ 'categories', '5', 'products', '112' ]
After:
{ articleId: '88' } [ 'articles', '88' ]
```

Notice how the number got converted to a string.

## Notes

Deleting a property results in an `array.splice([index])` operation. For a property with an object descriptor, the
lowest index is used (i.e. the static string is removed too).

Assigning `undefined` to a property is equivalent to deleting the property.

If you use `console.log` on the proxy, you will get the following output:

```js
{ proxy: 'populate a literal object using the spread operator' }
```

Since `console.log` will dump the proxy object's internal state instead of employing its handlers. To see what
properties the proxy would yield, do as the proxy suggests:

```js
console.log({ ...proxy });
```
