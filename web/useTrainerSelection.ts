import { useEffect, useMemo, useRef, useState } from "react";
import { liveFieldId } from "../shared/live";
import type { ClientBundle, LiveBattle, TrainerView } from "../shared/types";
import { getJson, sendJson } from "./api";

/** Which trainer and field are selected. A live battle selects its trainer and field automatically, until the user picks another. */
export function useTrainerSelection(bundle: ClientBundle, live: LiveBattle | null) {
  const [trainerKey, setTrainerKey] = useState<string | null>(null);
  const [fieldId, setFieldId] = useState("NONE");
  const [view, setView] = useState<TrainerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fromBattle, setFromBattle] = useState<{ battleId: string; exact: boolean } | null>(null);
  const manualBattle = useRef<string | null>(null);

  useEffect(() => {
    setView(null);
    if (!trainerKey) return;
    getJson<TrainerView>(`/api/trainers/${encodeURIComponent(trainerKey)}`).then(setView, (e: Error) => setError(e.message));
  }, [trainerKey, bundle.spoilers]);

  const liveBattleId = live?.battleId ?? null;
  const liveMatchKey = live?.match?.key ?? null;
  const liveExact = live?.match?.exact ?? true;
  const liveField = live?.field.id ?? null;
  useEffect(() => {
    if (!liveBattleId || !liveMatchKey || manualBattle.current === liveBattleId) return;
    setTrainerKey(liveMatchKey);
    setFieldId(liveField ? liveFieldId(liveField) : "NONE");
    setFromBattle({ battleId: liveBattleId, exact: liveExact });
  }, [liveBattleId, liveMatchKey, liveExact, liveField]);

  const boss = useMemo(() => bundle.bosses.find((b) => b.variants.some((v) => v.trainerKey === trainerKey)) ?? null, [bundle.bosses, trainerKey]);
  const otherParties = fromBattle && !fromBattle.exact && trainerKey
    ? bundle.trainerIndex.filter((t) => {
        const cur = bundle.trainerIndex.find((x) => x.key === trainerKey);
        return cur && t.trainerType === cur.trainerType && t.name === cur.name;
      })
    : [];

  return {
    trainerKey, fieldId, setFieldId, view, error, setError, fromBattle, boss, otherParties,
    pick: (key: string) => {
      manualBattle.current = liveBattleId;
      setFromBattle(null);
      setTrainerKey(key);
      const b = bundle.bosses.find((x) => x.variants.some((v) => v.trainerKey === key));
      setFieldId(b?.fieldId ?? "NONE");
    },
    /** Show this trainer and field and stop live mode from replacing them for the current battle. */
    openTrainer: (key: string, field: string) => {
      manualBattle.current = liveBattleId;
      setFromBattle(null);
      setTrainerKey(key);
      setFieldId(field);
    },
    holdManual: () => { manualBattle.current = liveBattleId; },
    chooseVariant: (key: string) => { manualBattle.current = liveBattleId; setFromBattle(null); setTrainerKey(key); },
    switchParty: (key: string) => { if (fromBattle) manualBattle.current = fromBattle.battleId; setTrainerKey(key); },
    revealNext: () => {
      if (!trainerKey) return;
      sendJson<TrainerView>("POST", `/api/trainers/${encodeURIComponent(trainerKey)}/reveal-next`).then(setView, (e: Error) => setError(e.message));
    },
  };
}
