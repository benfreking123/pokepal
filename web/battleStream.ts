import { useEffect, useState } from "react";
import { subscribe } from "./events";
import type { LiveBattle, LiveBattleMessage } from "../shared/types";

export interface BattleStream {
  live: LiveBattle | null;
  error: string | null;
  reconnecting: boolean;
  /** Battle id of the last battle seen active in this page session; live mode applies only to it. */
  activeId: string | null;
  /** Battle id the user switched to manual mode for. Live mode stays off for it. */
  manualFor: string | null;
  setManual: (battleId: string | null) => void;
}

export function useBattleStream(): BattleStream {
  const [live, setLive] = useState<LiveBattle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [manualFor, setManual] = useState<string | null>(null);

  useEffect(() => {
    return subscribe("battle-state", (data) => {
      const msg = JSON.parse(data) as LiveBattleMessage;
      if ("error" in msg) {
        setError(msg.error);
        return;
      }
      setError(null);
      setLive(msg);
      if (msg.state === "active") setActiveId(msg.battleId);
    }, { onOpen: () => setReconnecting(false), onError: (open) => setReconnecting(!open) });
  }, []);

  return { live, error, reconnecting, activeId, manualFor, setManual };
}

/** The battle to show in live mode, or null for manual mode. */
export const liveBattleToShow = (s: BattleStream): LiveBattle | null =>
  s.live && s.activeId === s.live.battleId && s.manualFor !== s.live.battleId ? s.live : null;
