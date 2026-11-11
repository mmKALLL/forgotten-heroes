import type { LogEntry } from '../schema/state'

export function LogPanel({ log }: { log: LogEntry[] }) {
  return (
    <section className="panel" aria-label="Journal">
      <h2>Journal</h2>
      <ol className="log" role="list" aria-label="Log" reversed>
        {[...log].reverse().map((entry, i) => (
          <li key={log.length - i} className={`tone-${entry.tone}`}>
            <span className="muted small">Day {entry.day}</span> {entry.text}
          </li>
        ))}
      </ol>
    </section>
  )
}
