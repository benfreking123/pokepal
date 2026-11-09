import { useMemo, useState } from "react";
import { searchTrainers } from "../../shared/prep/trainers";
import type { ClientBundle } from "../../shared/types";

export function TrainerPicker({ bundle, trainerKey, onPick }: { bundle: ClientBundle; trainerKey: string | null; onPick: (key: string) => void }) {
  const [query, setQuery] = useState("");
  const hits = useMemo(() => searchTrainers(bundle.trainerIndex, bundle.bosses, query, 50), [bundle.trainerIndex, bundle.bosses, query]);
  const partyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of bundle.trainerIndex) counts.set(`${t.trainerType}:${t.name}`, (counts.get(`${t.trainerType}:${t.name}`) ?? 0) + 1);
    return counts;
  }, [bundle.trainerIndex]);
  return (
    <section className="card">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search trainers (name, type or boss)" aria-label="Search trainers" style={{ width: "100%" }} />
      <ul className="prep-results">
        {hits.map(({ entry, boss: b }) => {
          const parties = partyCounts.get(`${entry.trainerType}:${entry.name}`) ?? 1;
          return (
            <li key={entry.key}>
              <button type="button" className={entry.key === trainerKey ? "active" : ""} aria-pressed={entry.key === trainerKey} onClick={() => onPick(entry.key)}>
                {entry.key === trainerKey ? "✓ " : ""}{b ? <strong>{b.name}</strong> : entry.label}
                {parties > 1 ? ` · team ${entry.partyId}` : ""}
                {entry.maxLevel !== undefined ? ` · up to Lv. ${entry.maxLevel}` : ""}
                {b?.context?.location ? ` · ${b.context.location}` : ""}
              </button>
            </li>
          );
        })}
        {hits.length === 0 ? <li className="muted">No trainers match.</li> : null}
      </ul>
    </section>
  );
}
