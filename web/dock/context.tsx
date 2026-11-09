import { createContext, useContext } from "react";
import type { ClientBundle } from "../../shared/types";
import type { BattleStream } from "../battleStream";

/** A request from another panel (History) to show a battle's trainer, or its wild Pokémon, in the Battle panel. */
export interface BattleFocus {
  nonce: number;
  trainerKey: string | null;
  fieldId: string;
  species: { species: string; form: number } | null;
}

export interface DashboardData {
  bundle: ClientBundle | null;
  stream: BattleStream;
  reload: () => void;
  focus: BattleFocus | null;
  openBattle: (focus: Omit<BattleFocus, "nonce">) => void;
}

export const DashboardContext = createContext<DashboardData | null>(null);

export function useDashboard(): DashboardData {
  const v = useContext(DashboardContext);
  if (!v) throw new Error("DashboardContext missing");
  return v;
}
