import { useEffect, useState } from "react";
import { formatWhen, historyFieldName, historyFocus, historyTitle } from "../../shared/history";
import type { BattleHistoryEntry, ClientBundle } from "../../shared/types";
import { getJson } from "../api";
import type { BattleStream } from "../battleStream";
import { useDashboard } from "../dock/context";

const RESULT_LABEL = { won: "Won", lost: "Lost" } as const;

function useBattleHistory(stream: BattleStream, spoilers: ClientBundle["spoilers"]) {
  const [entries, setEntries] = useState<BattleHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const live = stream.live;
  const stamp = live ? `${live.battleId}:${live.state}:${live.updatedAt}` : null;
  useEffect(() => {
    getJson<BattleHistoryEntry[]>("/api/battle/history").then((e) => { setEntries(e); setError(null); }, (e: Error) => setError(e.message));
  }, [stamp, spoilers]);
  return { entries, error };
}

export function HistoryTab({ bundle, stream }: { bundle: ClientBundle; stream: BattleStream }) {
  const { openBattle } = useDashboard();
  const { entries, error } = useBattleHistory(stream, bundle.spoilers);

  return (
    <div className="history">
      {error ? <p className="notice warn" role="alert">{error}</p> : null}
      {entries === null ? <p className="muted">Loading…</p> : entries.length === 0 ? (
        <p className="notice">No battles yet. Fights show up here as soon as the game starts them.</p>
      ) : (
        <ul className="history-list">
          {entries.map((e) => {
            const focus = historyFocus(bundle, e);
            const field = historyFieldName(bundle, e);
            const level = e.kind === "wild" && e.foes[0]?.level !== undefined ? ` Lv. ${e.foes[0].level}` : "";
            const outcome = e.state === "active" ? "live" : e.result ?? "unknown";
            return (
              <li key={e.battleId}>
                <button type="button" className="history-row" disabled={!focus} onClick={() => focus && openBattle(focus)} title={focus ? "Open in the Battle panel" : "This trainer is not in the data"}>
                  <span className={`history-result ${outcome}`}>{e.state === "active" ? "Live" : e.result ? RESULT_LABEL[e.result] : "—"}</span>
                  <span className="history-main">
                    <span className="history-title"><strong>{historyTitle(bundle, e)}</strong>{level}</span>
                    <small>{e.kind === "wild" ? "Wild" : "Trainer"}{field ? ` · ${field}` : ""}</small>
                  </span>
                  <span className="history-when">{formatWhen(e.startedAt)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
