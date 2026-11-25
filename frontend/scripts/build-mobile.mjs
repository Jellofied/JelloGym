/* npm run build:mobile's first step, cross-platform by design. The old script wrote
 * `VITE_MOBILE=1 vite build`, which is POSIX-shell syntax: on Windows cmd it dies with
 * "'VITE_MOBILE=1' is not recognized", the && chain stops before the media staging, and the
 * worktree is left one `cap sync` away from an APK with the web shell and no exercise media.
 * Setting VITE_MOBILE here (before vite reads its config) gives the flavour plugin in
 * vite.config.js and every import.meta.env.VITE_MOBILE in the app the same flag the shell
 * prefix used to. */
process.env.VITE_MOBILE = '1'
const { build } = await import('vite')
await build()
