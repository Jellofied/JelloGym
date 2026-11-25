import { useEffect, useRef, useState } from 'react'
import { fmtVol } from '../lib/format.js'
import { workoutDay, workoutDuration, sessionVolume } from '../lib/history.js'
import { t, tn } from '../lib/i18n.js'
import { Segmented } from './ui.jsx'
import { dayNoteOf, dayNoteLine } from '../lib/day-notes.js'
import DayHeatmap from './DayHeatmap.jsx'

const normalizeMetric = value => value === 'vol' ? 'vol' : 'time'

// GitHub-style activity heatmap, shaded by the selected time or volume metric per day.
// The grid itself is DayHeatmap; this holds the per-workout counts, the metric ramp and the notes.
export default function Heatmap({ S, onDay, metric: selectedMetric, onMetricChange }) {
  const wrapRef = useRef(null)
  const [localMetric, setLocalMetric] = useState(() => normalizeMetric(selectedMetric ?? S?.heatmapMetric))
  useEffect(() => { if (wrapRef.current) wrapRef.current.scrollLeft = wrapRef.current.scrollWidth }, [])

  const metric = normalizeMetric(selectedMetric ?? localMetric)
  const metricValue = metric === 'vol' ? 'vol' : 'min'
  const changeMetric = value => {
    const next = normalizeMetric(value)
    if (selectedMetric == null) setLocalMetric(next)
    onMetricChange?.(next)
  }

  const agg = {}
  ;(S.workouts || []).forEach(w => {
    const day = workoutDay(w)
    if (!day) return
    const a = agg[day] = agg[day] || { n: 0, vol: 0, min: 0 }
    a.n++
    // Recounted from the sets (sessionVolume), so units, per-side and the warm-up switch apply.
    a.vol += sessionVolume(w, S)
    a.min += Math.max(0, Math.round(workoutDuration(w) / 60000))
  })
  const values = {}
  for (const d in agg) values[d] = agg[d][metricValue]
  const listed = Object.values(values).filter(v => v > 0).sort((a, b) => a - b)
  const q = p => (listed.length ? listed[Math.min(listed.length - 1, Math.floor(p * listed.length))] : 0)
  const t1 = q(0.25), t2 = q(0.5), t3 = q(0.75)
  // A day with a workout but nothing in the chosen metric still reads as trained (l1).
  const levelOf = (v, key) => { const a = agg[key]; return !a ? 0 : !v ? 1 : v >= t3 ? 4 : v >= t2 ? 3 : v >= t1 ? 2 : 1 }
  const titleFor = (v, key) => {
    const a = agg[key]
    // A day off with a note (#261): its note in the tooltip, next to the plain date.
    const note = !a && dayNoteOf(S, key)
    return a ? `${tn('{0} workout', '{0} workouts', a.n)} · ${t('{0} min', a.min)} · ${fmtVol(a.vol, S.unit)}`
      : note ? dayNoteLine(note, t) : ''
  }
  const classFor = key => (!agg[key] && dayNoteOf(S, key) ? ' noted' : '')

  return <>
    <Segmented value={metric} onChange={changeMetric}
      options={[{ value: 'time', label: t('Time') }, { value: 'vol', label: t('Volume') }]} />
    <DayHeatmap S={S} values={values} levelOf={levelOf} titleFor={titleFor} classFor={classFor} wrapRef={wrapRef}
      onDay={key => { if (agg[key] || dayNoteOf(S, key)) onDay?.(key) }}
      legend={<div className="hm-legend">{t(metric === 'vol' ? 'Less volume' : 'Less time')} <div className="hm-c l0" /><div className="hm-c l1" /><div className="hm-c l2" /><div className="hm-c l3" /><div className="hm-c l4" /> {t(metric === 'vol' ? 'More volume' : 'More time')}</div>} />
  </>
}
