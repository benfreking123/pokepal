import { moveEffectiveness } from "../typechart";
import type { BaseChart, FieldOverlay, TypeId } from "../types";
import type { RecMon } from "./recommend";
import { scoreMatchup } from "./score";

export interface SwitchCandidate { mon: RecMon; hpPercent: number; active: boolean }
export interface SwitchPick { mon: RecMon; score: number; tag: string; active: boolean; hpPercent: number }

export const MAX_SWITCH_PICKS = 3;
const FLOOR = 1 / 8;
/** Taking the hit counts double: the Pokémon coming in absorbs the first attack. */
const DEFENCE_WEIGHT = 2;
const HP_WEIGHT = 0.5;

const abbr = (t: TypeId) => t.slice(0, 3).toUpperCase();

/** One short pill: immune, what it resists, else its best attacking type against the foe, else even. */
export function switchTag(chart: BaseChart, overlay: FieldOverlay, mon: RecMon, foeTypes: TypeId[], typeName: (t: TypeId) => string): string {
  let resist: TypeId | null = null;
  for (const t of foeTypes) {
    const e = moveEffectiveness(chart, { type: t }, mon.types, overlay);
    if (e.fails || e.max === 0) return "immune";
    if (e.max < 1 && !resist) resist = t;
  }
  if (resist) return `resists ${typeName(resist)}`;
  let best: { t: TypeId; m: number } | null = null;
  for (const t of mon.types) {
    const e = moveEffectiveness(chart, { type: t }, foeTypes, overlay);
    if (!e.fails && e.min > 1 && (!best || e.min > best.m)) best = { t, m: e.min };
  }
  return best ? `${best.m}x ${abbr(best.t)}` : "even";
}

/**
 * Ranks who to bring in against a foe that is about to come out, using only the foe's types. Resisting or being
 * immune to its types (its likely STAB) counts most, then attacking it, then remaining HP. Fainted Pokémon must be
 * left out by the caller. A Pokémon already out only appears when it is the best choice, so the list can say "stay".
 */
export function rankSwitchIns(chart: BaseChart, overlay: FieldOverlay, foeTypes: TypeId[], candidates: SwitchCandidate[], typeName: (t: TypeId) => string): SwitchPick[] {
  if (foeTypes.length === 0) return [];
  const foe = { name: "", species: "", form: 0, level: null, types: foeTypes };
  const ranked = candidates.map((c) => {
    const d = scoreMatchup(chart, overlay, { uid: c.mon.uid, name: c.mon.name, level: c.mon.level, types: c.mon.types, moves: [], order: 0 }, foe);
    const score = -DEFENCE_WEIGHT * Math.log2(Math.max(d.threat, FLOOR)) + Math.log2(Math.max(d.offense, FLOOR)) + (c.hpPercent / 100) * HP_WEIGHT;
    return { mon: c.mon, score, active: c.active, hpPercent: c.hpPercent, tag: switchTag(chart, overlay, c.mon, foeTypes, typeName) };
  }).sort((a, b) => b.score - a.score || b.hpPercent - a.hpPercent || b.mon.level - a.mon.level);
  const pool = ranked[0]?.active ? ranked : ranked.filter((r) => !r.active);
  return pool.slice(0, MAX_SWITCH_PICKS);
}
