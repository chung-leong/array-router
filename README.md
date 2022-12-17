# Array-router ![ci](https://img.shields.io/github/actions/workflow/status/chung-leong/array-router/node.js.yml?branch=main&label=Node.js%20CI&logo=github) ![nycrc config on GitHub](https://img.shields.io/nycrc/chung-leong/array-router)

Array-route is a simple, light-weight library that helps you manage routes in your React application.

## Syntax

App.js
```js
import { useRouter } from 'array-router';
/* ... */
export default function App() {
  const provide = useRouter();
  return (
    <div className="App">
      {provide((parts, query, { throw404 }) => {
        try {
          switch (parts[0]) {
            case undefined:
              return <WelcomePage />
            case 'categories':
              return <CategoryPage />
            case 'forums':
              return <ForumPage />
            default:
              throw404();
          }
        } catch (err) {
          return <ErrorPage error={err} />
        }
      })}
    </div>
  );
}
```

CategoryPage.js
```js
export default function CategoryPage() {
  const [ parts, query ] = useRoute();
  const categoryId = parts[1];
  return (
    /* ... */
  );
}
```

## Basic design

Array-router does not actually provide any routing logic. Instead, it gives you an `Array` containing
`pathname.split('/')` and an `Object` containing values from `searchParams`. You can then use them to build out
a routing scheme that suits the needs of your app.

The aforementioned array and object are
<a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy">JavaScript proxy
objects</a>. Array-router tracks all actions you perform on them and takes appropriate actions based on this
information. In the above example, Array-router knows that `App` reads the first item when it renders while
`CategoryPage` reads the second. If the location changes from `/categories/1` to `/categories/2`, Array-router will
ask `CategoryPage` to rerender but not `App` since only `parts[1]` is different.

Mutation of `parts` or `query` will cause the location to change. For instance, `parts.push('product', 17)` would move
you from `/categories/1` to `/categories/1/product/17`. Conversely, `parts.pop()` would send you from `/categories/1`
to `/categories` while `parts.splice(0)` would send you all the way back to the root level.

By default, changes to `parts` trigger calls to `pushState` while changes to `query` trigger calls to
`replaceState`. When both type of changes occur, `pushState` has precedence.
