# RouteChangePending

Error object that a [detour trap](./trap.md) would receive when the user clicks a link or uses the browser's
back/forward buttons

## Properties

* `url` - `<URL>` The destination URL
* `parts` - `<string[]>` The destination path parts
* `query` - `<Object>` The destination query variables
* `reason` - "link" or "back" or "forward"
* `source` - `<HTMLAnchorElement>` Anchor element that was clicked (null if `reason` is not "link")
* `internal` - `<boolean>` Whether the URL points to a location within the app
* `onSettlement` - `<Function>` A handle that will be invoked when a decision is made

## Methods

* `proceed` <sup>async</sup> - Proceed with the change
* `prevent` - Prevent the change from occurring

## Notes

When there are multiple traps, `proceed` would wait for the others to approve the change as well. It would throw an
error if one of the other traps chooses to prevent the change.
