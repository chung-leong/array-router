# RouteError

Error that gets thrown when [`throw404`](./throw404.md) is called

## Properties

* `url` - `<URL>` The URL that caused the error
* `parts` - `<string[]>` The path parts
* `query` - `<Object>` The query variables
* `status` - 404
* `statusText` - "Not Found"

# Methods

* `redirect` - Redirect to a new location with the given parts and query
