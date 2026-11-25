// The one loading state for lazy routes (App.jsx). It holds a page-sized space while the chunk
// arrives, so the view does not land as an empty screen. `compact` is for the tour's own chunk,
// which floats over a settled page and must not push the content or cover the tab bar.
export default function RouteLoading({ compact = false }) {
  return <div className={'route-loading' + (compact ? ' compact' : '')} role="status">
    <span className="route-loading-mark" aria-hidden="true" />
    <span>Loading…</span>
  </div>
}
