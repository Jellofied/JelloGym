import { queueView } from '../lib/queue.js'
import { t } from '../lib/i18n.js'

// Home's progress row for a coach week (S.queue) — it stands in for the seven weekday dots
// while a planner-written queue runs the week, because its sessions have no weekday: they are done in
// order, on whatever days you train. The row is one line: the week's name and how much of it is
// logged. Which session is next and starting any of them belong to the today row and to Plan's
// rotation editor, not here.
// Reads through queueView so the count here and the today row (effectiveRoutineIds →
// queueNext) can never disagree.
export default function QueueRow({ S, today, managed }) {
  const v = queueView(S, today)
  if (!v) return null
  return <div className="queue">
    <div className="row between">
      {/* Your own loop is called 'Rotation' in the language on screen: its saved name is only ever
          the word itself, which older saves kept in the language the loop was made in. */}
      <div className="small muted" style={{ fontWeight: 500 }}>{managed ? t('Rotation') : v.label}</div>
      {/* Your own loop speaks in rounds, as Plan does; a coach's week keeps its plain count. */}
      <div className="small muted">{managed ? t('{0} of {1} done this round.', v.items.length - v.remaining.length, v.items.length) : `${v.items.length - v.remaining.length} / ${v.items.length}`}</div>
    </div>
  </div>
}
