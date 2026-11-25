// The shared progress ring (docs/LIFE_MODULES.md, Water decision): one component, built for the
// Water card and reused by every later module (Habits, Steps, Sleep, Food, the perfect-day ring).
//
// Same visual idiom as the Coach debrief ring (.deb-ring in coach.css): a conic-gradient sweep
// with a punched-out face, driven by `--pct` (0..1, clamped here). The centre shows the caption
// (usually the whole-number percent or a short value) and an optional small line.
export default function ProgressRing({ pct = 0, size = 64, caption = null, small = null, tint = 'var(--acc)', track = 'var(--surface-3)', className = '', ...rest }) {
  const p = Math.max(0, Math.min(1, Number(pct) || 0))
  return <div className={'progress-ring' + (className ? ' ' + className : '')}
    style={{ '--pct': p, '--ring-tint': tint, '--ring-track': track, width: size, height: size }}
    role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)} {...rest}>
    <span className="progress-ring-face">
      {caption != null && <span className="progress-ring-caption">{caption}</span>}
      {small != null && <small>{small}</small>}
    </span>
  </div>
}
