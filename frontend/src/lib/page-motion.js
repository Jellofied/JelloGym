/* How a page arrives, like Settings on the iPhone: going one level deeper (a settings page from
   Settings) slides it in from the right, going back up slides the parent in from the left, and
   everything else (tabs, a fresh load) keeps the soft fade. Read at mount, from the path it
   replaces.

   `peer`: the two halves of one screen that the top tabs switch between (/stats and /stats/life)
   nest by path but are not one level inside the other, and a slide said the half you left was
   still underneath. The caller knows which pairs are peers, so it says so; both directions then
   keep the fade a tab switch always gets. */
export function pageMotion(from, to, navType, peer = false) {
  if (peer) return 'fade'
  // The tabs are the top level: Home is '/', not the parent of every other tab.
  if (!from || from === to || from === '/' || to === '/') return 'fade'
  const deeper = to.startsWith(from.endsWith('/') ? from : from + '/')
  const upper = from.startsWith(to.endsWith('/') ? to : to + '/')
  if (deeper && navType !== 'POP') return 'push'
  if (upper && navType === 'POP') return 'pop'
  return 'fade'
}
