import { useState, type ReactNode } from "react";
import type { SwapWarning } from "../../server/crossplay/lineage";

export function ConfirmDialog({ title, warnings, cards, onConfirm, onCancel }: {
  title: string; warnings: SwapWarning[]; cards?: ReactNode; onConfirm: () => void; onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="dialog">
        <h3>{title}</h3>
        <ul className="warnings">{warnings.map((w) => <li key={w.code} className="bad">{w.message}</li>)}</ul>
        {cards}
        <label className="settings-row">
          <span>Type REPLACE to continue</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" />
        </label>
        <div className="toolbar">
          <button disabled={typed !== "REPLACE"} onClick={onConfirm}>Replace</button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
