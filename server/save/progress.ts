import type { SaveProgress } from "../../shared/whatsNext";
import { ivar } from "./readSave";
import { SAVE_PATHS } from "./schema";

export interface TrackedIds { variables: number[]; switches: number[] }

const rootOf = (roots: unknown[]) => (roots[0] ?? {}) as Record<string, unknown>;

/** Copies only the named variable/switch ids out of the save (Game_Variables/@data and Game_Switches/@data are 1-indexed arrays). */
export function readProgress(roots: unknown[], tracked: TrackedIds, extra: { mapName: string | null; fieldNoteCount: number | null }): SaveProgress {
  const trainer = SAVE_PATHS.trainer(roots);
  const varData = ivar(rootOf(roots).variable, "data");
  const switchData = SAVE_PATHS.switches(roots);
  const variables: Record<number, number> = {};
  if (Array.isArray(varData)) for (const id of tracked.variables) if (typeof varData[id] === "number") variables[id] = varData[id] as number;
  const switches: Record<number, boolean> = {};
  if (switchData) for (const id of tracked.switches) switches[id] = switchData[id] === true;
  const postgame = Number(ivar(trainer, "postgame") ?? 0);
  return {
    badges: SAVE_PATHS.badges(trainer).filter((b) => b === true).length,
    postgame: Number.isFinite(postgame) ? postgame : 0,
    mapId: SAVE_PATHS.mapId(roots),
    mapName: extra.mapName,
    playtimeSeconds: SAVE_PATHS.playtimeSeconds(roots),
    variables, switches,
    fieldNotes: switches[599] === true,
    fieldNoteCount: extra.fieldNoteCount,
  };
}
