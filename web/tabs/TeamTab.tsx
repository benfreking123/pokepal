import { onSaveChanged } from "../events";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { teamToShowdown } from "../../shared/showdown";
import type { ClientBundle, OwnedMon, SaveSummary } from "../../shared/types";
import type { CrossplayStatus } from "../../server/crossplay/actions";
import { getJson } from "../api";
import { CopyButton } from "../components/CopyButton";
import { monDisplay, MonCard } from "../components/MonCard";
import { SaveMetaCard } from "../components/SaveMetaCard";

const fmtTime = (iso: string) => new Date(iso).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });

export function TeamTab({ bundle }: { bundle: ClientBundle }) {
  const [save, setSave] = useState<SaveSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [box, setBox] = useState(0);
  const [query, setQuery] = useState("");
  const [exportText, setExportText] = useState<string | null>(null);
  const [handoffAt, setHandoffAt] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(() => {
    getJson<SaveSummary>("/api/save/summary").then((s) => { setSave(s); setError(null); }, (e: Error) => setError(e.message));
    getJson<CrossplayStatus>("/api/crossplay/status").then((s) => setHandoffAt(s.ledger.holder === "runa" ? s.ledger.handoff?.at ?? null : null), () => setHandoffAt(null));
  }, []);

  useEffect(() => {
    load();
    return onSaveChanged(load);
  }, [load]);

  const unknown = useMemo(() => new Set(save?.unknownIds ?? []), [save]);
  const all = useMemo(() => (save ? [...save.party, ...save.boxes.flatMap((b) => b.mons)] : []), [save]);

  const matches = useCallback((m: OwnedMon, q: string) => {
    const { name, types } = monDisplay(m, bundle);
    const hay = [name, m.nickname ?? "", ...types.map((t) => bundle.types.find((x) => x.id === t)?.name ?? t), ...m.moves.map((id) => bundle.moves[id]?.name ?? id)].join(" ").toLowerCase();
    return hay.includes(q);
  }, [bundle]);

  if (error) return <p className="notice warn" role="alert">{error}</p>;
  if (!save) return <p>Loading…</p>;

  const q = query.trim().toLowerCase();
  const boxMons = q ? save.boxes.flatMap((b) => b.mons).filter((m) => matches(m, q)) : save.boxes[box]?.mons ?? [];
  const toggle = (uid: string) => setSelected((s) => { const n = new Set(s); if (n.has(uid)) n.delete(uid); else n.add(uid); return n; });
  const open = (mons: OwnedMon[]) => setExportText(teamToShowdown(mons, bundle));

  return (
    <div>
      {handoffAt ? <p className="notice warn">Runa has the save since {fmtTime(handoffAt)}; this is the PC copy from before the hand-off.</p> : null}
      <SaveMetaCard meta={save.meta} />
      <h2>Party</h2>
      <div className="toolbar">
        <button onClick={() => open(save.party)}>Export party</button>
        <button disabled={selected.size === 0} onClick={() => open(all.filter((m) => selected.has(m.uid)).sort((a, b) => a.order - b.order))}>Export selected ({selected.size})</button>
      </div>
      <div className="grid">{save.party.map((m) => <MonCard key={m.uid} mon={m} data={bundle} unknown={unknown} selected={selected.has(m.uid)} onToggle={() => toggle(m.uid)} />)}</div>
      <h2>Boxes</h2>
      <div className="toolbar">
        <select value={box} onChange={(e) => setBox(Number(e.target.value))} aria-label="Box" disabled={!!q}>
          {save.boxes.map((b, i) => <option key={i} value={i}>{b.name || `Box ${i + 1}`} ({b.mons.length})</option>)}
        </select>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all boxes by name, type or move" aria-label="Search boxes" />
      </div>
      {boxMons.length === 0 ? <p>No Pokémon here.</p> : null}
      <div className="grid">{boxMons.map((m) => <MonCard key={m.uid} mon={m} data={bundle} unknown={unknown} selected={selected.has(m.uid)} onToggle={() => toggle(m.uid)} />)}</div>
      {exportText !== null ? (
        <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Showdown export">
          <div className="dialog">
            <h3>Showdown export</h3>
            <textarea ref={textareaRef} readOnly rows={16} value={exportText} style={{ width: "100%" }} />
            <div className="toolbar"><CopyButton text={exportText} textareaRef={textareaRef} /><button onClick={() => setExportText(null)}>Close</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
