# RouteChangePending

Error object that a [detour trap](./trap.md) would receive when the user clicks a link or uses the browser's
back/forward buttons

## Properties

* `url` - `<URL>` The destination URL
* `parts` - `<string[]>` The destination path parts
* `query` - `<Object>` The destination query variables
* `reason` - "link" or "back" or "forward"
* `internal` - `<boolean>` Whether the URL points to a location within the app
* `onSettlement` - `<Function>` A handle that will be invoked when a decision is made

## Methods

* `proceed` <sup>async</sup> - Proceed with the change
* `prevent` - Prevent the change from occurring
