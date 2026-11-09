import type { BaseChart, FieldOverlay, SecondaryTypeRule, TypeId } from "./types";

export const NO_FIELD: FieldOverlay = { fieldId: "NONE", notes: [], source: "base chart" };

const INVERT: Record<number, number> = { 0: 2, 0.5: 2, 1: 1, 2: 0.5 };

export function typeVsType(chart: BaseChart, attack: TypeId, defend: TypeId, overlay: FieldOverlay = NO_FIELD): number {
  const override = overlay.overrides?.find((o) => o.attack === attack && o.defend === defend);
  const value = override ? override.multiplier : chart[attack]?.[defend] ?? 1;
  return overlay.invert ? INVERT[value] ?? value : value;
}

export function typeVsTypes(chart: BaseChart, attack: TypeId, defenders: TypeId[], overlay: FieldOverlay = NO_FIELD): number {
  return defenders.reduce((acc, d) => acc * typeVsType(chart, attack, d, overlay), 1);
}

export interface MoveInput { type: TypeId; id?: string; category?: "physical" | "special" | "status" }
export interface Effectiveness { min: number; max: number; fails: boolean; effectiveType: TypeId; secondary: TypeId[][] }

function ruleMatches(rule: SecondaryTypeRule, move: MoveInput): boolean {
  const m = rule.match;
  if (m.moveType && m.moveType !== move.type) return false;
  if (m.moveIds && (!move.id || !m.moveIds.includes(move.id))) return false;
  if (m.category && m.category !== move.category) return false;
  return true;
}

export function moveEffectiveness(chart: BaseChart, move: MoveInput, defenders: TypeId[], overlay: FieldOverlay = NO_FIELD): Effectiveness {
  const effectiveType = overlay.moveTypeRemap?.find((r) => r.from === move.type)?.to ?? move.type;
  if (overlay.failingMoveTypes?.includes(move.type)) return { min: 0, max: 0, fails: true, effectiveType, secondary: [] };
  const secondary = (overlay.secondaryTypes ?? [])
    .filter((r) => ruleMatches(r, move))
    .map((r) => (r.addType ? [r.addType] : r.oneOf ?? []))
    .filter((opts) => opts.length > 0);
  let min = typeVsTypes(chart, effectiveType, defenders, overlay);
  let max = min;
  for (const opts of secondary) {
    const values = opts.map((t) => typeVsTypes(chart, t, defenders, overlay));
    min *= Math.min(...values);
    max *= Math.max(...values);
  }
  return { min, max, fails: false, effectiveType, secondary };
}

export const typeBoost = (overlay: FieldOverlay, type: TypeId) => overlay.typeBoosts?.find((b) => b.type === type)?.factor ?? 1;

export function mergeOverlay(fieldId: string, extracted: Partial<FieldOverlay> | undefined, curated: FieldOverlay | undefined): FieldOverlay {
  const pick = <K extends keyof FieldOverlay>(k: K) => curated?.[k] ?? extracted?.[k];
  return {
    fieldId,
    invert: pick("invert"),
    overrides: pick("overrides"),
    moveTypeRemap: pick("moveTypeRemap"),
    secondaryTypes: pick("secondaryTypes"),
    failingMoveTypes: pick("failingMoveTypes"),
    typeBoosts: pick("typeBoosts"),
    notes: [...(extracted?.notes ?? []), ...(curated?.notes ?? [])],
    source: [extracted ? "extracted field data" : null, curated?.source ?? null].filter(Boolean).join("; ") || "base chart",
  };
}

export function changedCells(chart: BaseChart, types: TypeId[], overlay: FieldOverlay): Set<string> {
  const out = new Set<string>();
  for (const a of types) for (const d of types) if (typeVsType(chart, a, d, overlay) !== typeVsType(chart, a, d)) out.add(`${a}>${d}`);
  return out;
}
