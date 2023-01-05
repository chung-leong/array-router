# rethrow()

Throw error caught at error boundary

## Syntax

```js
function App() {
  const provide = useRouter();
  return (
    <div className="app">
      {provide((parts, query, { rethrow }) => {
        rethrow();
        return <Component />;
      })}
    </div>
  );
}
```

## Notes

`rethrow` does nothing when there is no error.

You generally don't need to use this, since any attempt to access `parts` or `query` would cause the error to be
thrown.
