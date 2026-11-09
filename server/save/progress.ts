import type { SaveProgress } from "../../shared/whatsNext";
import { ivar, sym } from "./readSave";
import { SAVE_PATHS } from "./schema";

export interface TrackedIds { variables: number[]; switches: number[]; items?: string[] }

/** Bag layout is not documented; accept any [itemSymbol, quantity] pair (or a bare symbol) anywhere under PokemonBag. */
export function bagItems(bag: unknown, wanted: string[]): Record<string, boolean> {
  const found: Record<string, number> = {};
  const walk = (node: unknown, depth: number) => {
    if (depth > 6 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      const id = sym(node[0]);
      if (node.length === 2 && id && typeof node[1] === "number") { found[id] = (found[id] ?? 0) + node[1]; return; }
      for (const el of node) {
        if (typeof el === "symbol") { const s = sym(el); if (s) found[s] = (found[s] ?? 0) + 1; } else walk(el, depth + 1);
      }
      return;
    }
    for (const v of Object.values(node as Record<string, unknown>)) walk(v, depth + 1);
  };
  walk(bag, 0);
  return Object.fromEntries(wanted.map((id) => [id, (found[id] ?? 0) > 0]));
}

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
    items: bagItems(rootOf(roots).PokemonBag, tracked.items ?? []),
    fieldNotes: switches[599] === true,
    fieldNoteCount: extra.fieldNoteCount,
  };
}
