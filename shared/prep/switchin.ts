import { moveEffectiveness, typeBoost } from "../typechart";
import type { BaseChart, FieldOverlay, TypeId } from "../types";
import type { RecMon } from "./recommend";
import type { PrepMove } from "./score";

export interface SwitchCandidate { mon: RecMon; hpPercent: number; active: boolean; moves?: PrepMove[]; speed?: number | null }
export type DefenceKind = "immune" | "resist" | "weak" | "even";
export interface DefenceFact { kind: DefenceKind; type: TypeId | null; mult: number }
export interface OffenceFact { move: string | null; type: TypeId; mult: number }
export interface SwitchPick {
  mon: RecMon; score: number; tag: string; active: boolean; hpPercent: number;
  defence: DefenceFact; offence: OffenceFact | null;
  /** Set only when the picks would otherwise show the same reasons (same defence and same best move), so Speed tells them apart. */
  note?: "faster" | "slower";
}
export interface SwitchOptions {
  foeSpeed?: number | null; maxPicks?: number;
  /** Type sets to hit when several foes are out (doubles); the best of them counts. Defaults to the foe types given. */
  offenceVs?: TypeId[][];
}

export const MAX_SWITCH_PICKS = 3;
const FLOOR = 1 / 4;
const CEIL = 4;
/** Taking the hit counts for most: the Pokémon coming in absorbs the first attack. Both foe types count, the worse one more. */
const WORST_WEIGHT = 1.5;
const OTHER_WEIGHT = 0.5;
const HP_WEIGHT = 1.5;
const SPEED_WEIGHT = 0.3;
const STAB = 1.5;
const DEFAULT_POWER = 60;

const abbr = (t: TypeId) => t.slice(0, 3).toUpperCase();
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const log = (x: number) => Math.log2(clamp(x, FLOOR, CEIL));

/** What the foe's types (its likely STAB) do to this Pokémon: the worst of them decides the fact shown. */
export function defenceFact(chart: BaseChart, overlay: FieldOverlay, monTypes: TypeId[], foeTypes: TypeId[]): DefenceFact & { score: number } {
  const hits = foeTypes.map((t) => {
    const e = moveEffectiveness(chart, { type: t }, monTypes, overlay);
    return { t, m: e.fails ? 0 : e.max };
  });
  const sorted = [...hits].sort((a, b) => b.m - a.m);
  const worst = sorted[0];
  const others = sorted.slice(1);
  const score = others.length
    ? -(WORST_WEIGHT * log(worst.m) + OTHER_WEIGHT * (others.reduce((s, h) => s + log(h.m), 0) / others.length))
    : -(WORST_WEIGHT + OTHER_WEIGHT) * log(worst.m);
  if (worst.m > 1) return { kind: "weak", type: worst.t, mult: worst.m, score };
  const best = [...hits].sort((a, b) => a.m - b.m)[0];
  if (best.m === 0) return { kind: "immune", type: best.t, mult: 0, score };
  if (best.m < 1) return { kind: "resist", type: best.t, mult: best.m, score };
  return { kind: "even", type: null, mult: 1, score };
}

/** The best attack against the foe: its real moves when known, else its own types as if it had a STAB move. */
export function offenceFact(chart: BaseChart, overlay: FieldOverlay, mon: RecMon, moves: PrepMove[] | undefined, foeTypes: TypeId[]): (OffenceFact & { score: number }) | null {
  const damaging = (moves ?? []).filter((m) => m.power > 0 || m.category !== undefined);
  const attacks: { move: string | null; type: TypeId; id?: string; category?: PrepMove["category"]; power: number }[] = damaging.length
    ? damaging.map((m) => ({ move: m.label, type: m.type, id: m.id ?? undefined, category: m.category, power: m.power > 0 ? m.power : DEFAULT_POWER }))
    : moves?.length ? [] : mon.types.map((t) => ({ move: null, type: t, power: 80 }));
  let best: (OffenceFact & { score: number }) | null = null;
  let bestValue = 0;
  for (const a of attacks) {
    const e = moveEffectiveness(chart, { type: a.type, id: a.id, category: a.category }, foeTypes, overlay);
    if (e.fails) { if (!best) best = { move: a.move, type: a.type, mult: 0, score: Math.log2(FLOOR) }; continue; }
    const value = e.min * (mon.types.includes(e.effectiveType) ? STAB : 1) * typeBoost(overlay, e.effectiveType) * clamp(a.power / 80, 0.5, 1.5);
    if (value > bestValue) {
      bestValue = value;
      best = { move: a.move, type: a.type, mult: e.min, score: Math.log2(clamp(value, 1 / 8, 8)) };
    }
  }
  return best;
}

/** One short phrase for the web list: immune, what it resists, else its best attacking type against the foe, else even. */
export function switchTag(chart: BaseChart, overlay: FieldOverlay, mon: RecMon, foeTypes: TypeId[], typeName: (t: TypeId) => string): string {
  const d = defenceFact(chart, overlay, mon.types, foeTypes);
  if (d.kind === "immune") return "immune";
  if (d.kind === "resist") return `resists ${typeName(d.type!)}`;
  let best: { t: TypeId; m: number } | null = null;
  for (const t of mon.types) {
    const e = moveEffectiveness(chart, { type: t }, foeTypes, overlay);
    if (!e.fails && e.min > 1 && (!best || e.min > best.m)) best = { t, m: e.min };
  }
  return best ? `${best.m}x ${abbr(best.t)}` : "even";
}

/**
 * Ranks who to bring in against a foe, using only the foe's types and your own Pokémon's real moves and Speed.
 * Score = how well it takes the foe's STAB hits (worse type counts most) + how hard its best actual move hits (STAB,
 * power and the field included) + remaining HP + a little for outspeeding. Fainted Pokémon must be left out by the
 * caller. A Pokémon already out only appears when it is the best choice, so the list can say "stay".
 */
export function rankSwitchIns(chart: BaseChart, overlay: FieldOverlay, foeTypes: TypeId[], candidates: SwitchCandidate[], typeName: (t: TypeId) => string, opts: SwitchOptions = {}): SwitchPick[] {
  if (foeTypes.length === 0) return [];
  const ranked: SwitchPick[] = candidates.map((c) => {
    const d = defenceFact(chart, overlay, c.mon.types, foeTypes);
    const o = (opts.offenceVs ?? [foeTypes]).map((t) => offenceFact(chart, overlay, c.mon, c.moves, t)).reduce<ReturnType<typeof offenceFact>>((a, b) => (!a || (b && b.score > a.score) ? b : a), null);
    const faster = opts.foeSpeed && c.speed ? (c.speed > opts.foeSpeed ? 1 : -1) : 0;
    const score = d.score + (o ? o.score : 0) + (c.hpPercent / 100) * HP_WEIGHT + faster * SPEED_WEIGHT;
    const note = faster > 0 ? ("faster" as const) : faster < 0 ? ("slower" as const) : undefined;
    return {
      mon: c.mon, score, active: c.active, hpPercent: c.hpPercent, tag: switchTag(chart, overlay, c.mon, foeTypes, typeName),
      defence: { kind: d.kind, type: d.type, mult: d.mult }, offence: o ? { move: o.move, type: o.type, mult: o.mult } : null, ...(note ? { note } : {}),
    };
  }).sort((a, b) => b.score - a.score || b.hpPercent - a.hpPercent || b.mon.level - a.mon.level);
  const pool = ranked[0]?.active ? ranked : ranked.filter((r) => !r.active);
  const picks = pool.slice(0, opts.maxPicks ?? MAX_SWITCH_PICKS);
  const same = (a: SwitchPick, b: SwitchPick) =>
    a.defence.kind === b.defence.kind && a.defence.type === b.defence.type && a.offence?.move === b.offence?.move && a.offence?.mult === b.offence?.mult;
  const identical = picks.length > 1 && picks.every((p) => same(p, picks[0]));
  if (!(identical && picks.every((p) => p.note) && new Set(picks.map((p) => p.note)).size > 1)) for (const p of picks) delete p.note;
  return picks;
}
