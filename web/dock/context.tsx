import { createContext, useContext } from "react";
import type { ClientBundle } from "../../shared/types";
import type { BattleStream } from "../battleStream";

export interface DashboardData {
  bundle: ClientBundle | null;
  stream: BattleStream;
  reload: () => void;
}

export const DashboardContext = createContext<DashboardData | null>(null);

export function useDashboard(): DashboardData {
  const v = useContext(DashboardContext);
  if (!v) throw new Error("DashboardContext missing");
  return v;
}
