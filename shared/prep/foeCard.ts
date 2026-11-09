import { moveEffectiveness } from "../typechart";
import type { BaseChart, FieldOverlay, TypeId } from "../types";
import { recommend, type RecMon, type RecPill, type Recommendation } from "./recommend";
import type { PrepFoe } from "./score";

export interface Weakness { type: TypeId; x: number }
export interface Counter { mon: RecMon; pill: RecPill | null }
export interface FoeCardData {
  /** 4× and 2× hits against the foe, field-aware, strongest first. Empty when its types are unknown. */
  weaknesses: Weakness[];
  /** The top counters from the healthy party. */
  best: Counter[];
  /** A PC Pokémon, only when it clearly beats every healthy party member. */
  pc: Counter | null;
  unknown: boolean;
}

export const BEST_LIMIT = 2;

export function weaknessesOf(chart: BaseChart, overlay: FieldOverlay, typeIds: TypeId[], types: TypeId[]): Weakness[] {
  return typeIds
    .map((type) => ({ type, e: moveEffectiveness(chart, { type }, types, overlay) }))
    .filter(({ e }) => !e.fails && e.min >= 2)
    .map(({ type, e }) => ({ type, x: e.min }))
    .sort((a, b) => b.x - a.x);
}

const counter = (r: Recommendation): Counter => ({ mon: r.mon, pill: r.pills.find((p) => p.kind === "good") ?? null });

export function foeCardData(input: {
  chart: BaseChart; overlay: FieldOverlay; fieldName: string; typeName: (t: TypeId) => string; typeIds: TypeId[];
  foe: PrepFoe; party: RecMon[]; fainted?: RecMon[]; pc: RecMon[];
}): FoeCardData {
  const { foe } = input;
  if (foe.types.length === 0) return { weaknesses: [], best: [], pc: null, unknown: true };
  const r = recommend({ chart: input.chart, overlay: input.overlay, fieldName: input.fieldName, typeName: input.typeName, foes: [foe], party: input.party, fainted: input.fainted, pc: input.pc });
  return {
    weaknesses: weaknessesOf(input.chart, input.overlay, input.typeIds, foe.types),
    best: r.party.slice(0, BEST_LIMIT).map(counter),
    pc: r.pc[0] ? counter(r.pc[0]) : null,
    unknown: false,
  };
}
