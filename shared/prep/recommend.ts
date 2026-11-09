import { moveEffectiveness } from "../typechart";
import type { BaseChart, FieldOverlay, GameData, TypeId } from "../types";
import { scoreMatchup, type PrepCandidate, type PrepFoe } from "./score";

/** A Pokémon that could be sent in. Only types, level and base stats are ever used; moves are never read. */
export interface RecMon { uid: string; name: string; level: number; types: TypeId[]; baseStatTotal: number; box: string | null }
export interface Recommendation { mon: RecMon; score: number; reason: string }
export interface RecResult {
  /** Party members able to fight, best first. */
  party: Recommendation[];
  /** PC Pokémon that beat every healthy party member, best first. */
  pc: Recommendation[];
  /** Foes left out because their types are unknown (a disguised Illusion foe). */
  unknownFoes: string[];
  /** Party members that cannot battle. */
  fainted: RecMon[];
}

export const PC_MARGIN = 0.5;
export const PC_LIMIT = 3;
const BST_REFERENCE = 500;

export function baseStatTotal(data: GameData, species: string, form: number): number {
  const forms = data.species[species]?.forms;
  const f = forms?.find((x) => x.form === form) ?? forms?.[0];
  return (f?.baseStats ?? []).reduce((a, b) => a + b, 0);
}

export function formTypes(data: GameData, species: string, form: number): TypeId[] {
  const forms = data.species[species]?.forms;
  return (forms?.find((x) => x.form === form) ?? forms?.[0])?.types ?? [];
}

/** Drops everything but identity, level and types, so moves, abilities and items can never influence a recommendation. */
export function typeOnlyFoe(foe: PrepFoe): PrepFoe {
  return { name: foe.name, species: foe.species, form: foe.form, level: foe.level, types: foe.types };
}

/** A small tiebreak from base stats: about ±0.5 on the log2 matchup scale. */
export const baseStatEdge = (total: number) => (total > 0 ? Math.max(-0.5, Math.min(0.5, Math.log2(total / BST_REFERENCE) * 0.5)) : 0);

const asCandidate = (m: RecMon, order: number): PrepCandidate => ({ uid: m.uid, name: m.name, level: m.level, types: m.types, moves: [], order });

const joinNames = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

function describe(chart: BaseChart, overlay: FieldOverlay, fieldName: string, mon: RecMon, foes: PrepFoe[], typeName: (t: TypeId) => string, offense: number[]): string {
  const carriers = new Map<TypeId, number>();
  for (const f of foes) for (const t of new Set(f.types)) carriers.set(t, (carriers.get(t) ?? 0) + 1);
  const ranked = [...carriers.entries()].sort((a, b) => b[1] - a[1]);
  const immune: TypeId[] = [];
  const resists: TypeId[] = [];
  const weak: TypeId[] = [];
  for (const [t] of ranked) {
    const e = moveEffectiveness(chart, { type: t }, mon.types, overlay);
    if (e.fails) continue;
    if (e.max === 0) immune.push(t);
    else if (e.max < 1) resists.push(t);
    else if (e.max > 1) weak.push(t);
  }
  const onField = overlay.fieldId !== "NONE" && fieldName ? ` on ${fieldName}` : "";
  const parts: string[] = [];
  const shield = [
    immune.length ? `immune to ${joinNames(immune.slice(0, 3).map(typeName))}` : "",
    resists.length ? `resists ${joinNames(resists.slice(0, 3).map(typeName))}` : "",
  ].filter(Boolean);
  if (shield.length) parts.push(`${shield.join(", ")}${onField}`);
  const hit = foes.filter((_, i) => offense[i] > 1);
  if (hit.length) {
    const who = foes.length > 2 ? `${hit.length} of ${foes.length} foes` : joinNames(hit.map((f) => f.name));
    parts.push(`hits ${who} super-effectively`);
  }
  if (weak.length) parts.push(`weak to ${joinNames(weak.slice(0, 2).map(typeName))}`);
  return parts.length ? parts.join("; ") : "even matchup; edge comes from level and base stats";
}

export interface RecommendInput {
  chart: BaseChart;
  overlay: FieldOverlay;
  fieldName: string;
  typeName: (t: TypeId) => string;
  foes: PrepFoe[];
  party: RecMon[];
  /** Fainted party members, kept out of the ranking. */
  fainted?: RecMon[];
  pc: RecMon[];
}

export function recommend(input: RecommendInput): RecResult {
  const { chart, overlay, fieldName, typeName } = input;
  const foes = input.foes.filter((f) => f.types.length > 0).map(typeOnlyFoe);
  const unknownFoes = input.foes.filter((f) => f.types.length === 0).map((f) => f.name);
  const fainted = input.fainted ?? [];
  if (foes.length === 0) return { party: [], pc: [], unknownFoes, fainted };

  const rate = (m: RecMon, order: number): Recommendation => {
    const details = foes.map((f) => scoreMatchup(chart, overlay, asCandidate(m, order), f));
    const mean = details.reduce((s, d) => s + d.value, 0) / details.length;
    return { mon: m, score: mean + baseStatEdge(m.baseStatTotal), reason: describe(chart, overlay, fieldName, m, foes, typeName, details.map((d) => d.offense)) };
  };
  const byScore = (a: Recommendation, b: Recommendation) => b.score - a.score || b.mon.level - a.mon.level;

  const party = input.party.map((m, i) => rate(m, i)).sort(byScore);
  const bar = party.length ? party[0].score + PC_MARGIN : -Infinity;
  const pc = input.pc.map((m, i) => rate(m, i + 1000)).filter((r) => r.score >= bar).sort(byScore).slice(0, PC_LIMIT);
  return { party, pc, unknownFoes, fainted };
}
