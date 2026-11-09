import { moveEffectiveness, typeBoost } from "../typechart";
import type { BaseChart, FieldOverlay, GameData, OwnedMon, TrainerView, TypeId } from "../types";

export interface PrepMove { id: string | null; label: string; type: TypeId; category?: "physical" | "special"; power: number }
export interface PrepCandidate { uid: string; name: string; level: number; types: TypeId[]; moves: PrepMove[]; order: number }
export interface PrepFoe { name: string; species: string; form: number; level: number | null; types: TypeId[]; moves?: PrepMove[]; ability?: string | null; item?: string | null }
export interface MatchupDetail { value: number; offense: number; threat: number; bestMove: string | null; worstThreatType: TypeId | null; worstThreatMove: string | null }

const FLOOR = 1 / 16;
const STAB = 1.5;
export const ABILITY_IMMUNITIES: Record<string, TypeId[]> = {
  LEVITATE: ["GROUND"], FLASHFIRE: ["FIRE"], WATERABSORB: ["WATER"], STORMDRAIN: ["WATER"], DRYSKIN: ["WATER"],
  VOLTABSORB: ["ELECTRIC"], LIGHTNINGROD: ["ELECTRIC"], MOTORDRIVE: ["ELECTRIC"], SAPSIPPER: ["GRASS"],
};
export const ITEM_IMMUNITIES: Record<string, TypeId[]> = { AIRBALLOON: ["GROUND"] };
export const ITEM_TYPE_BOOSTS: Record<string, TypeId> = {
  SILKSCARF: "NORMAL", CHARCOAL: "FIRE", MYSTICWATER: "WATER", MIRACLESEED: "GRASS", MAGNET: "ELECTRIC", NEVERMELTICE: "ICE",
  BLACKBELT: "FIGHTING", POISONBARB: "POISON", SOFTSAND: "GROUND", SHARPBEAK: "FLYING", TWISTEDSPOON: "PSYCHIC", SILVERPOWDER: "BUG",
  HARDSTONE: "ROCK", SPELLTAG: "GHOST", DRAGONFANG: "DRAGON", BLACKGLASSES: "DARK", METALCOAT: "STEEL",
};
const ITEM_BOOST = 1.2;
const typeLabel = (t: TypeId) => `${t.charAt(0)}${t.slice(1).toLowerCase()} (type)`;

export function scoreMatchup(chart: BaseChart, overlay: FieldOverlay, mon: PrepCandidate, foe: PrepFoe): MatchupDetail {
  const damaging = mon.moves.filter((m) => m.power > 0);
  const attacks: PrepMove[] = damaging.length ? damaging : mon.types.map((t) => ({ id: null, label: typeLabel(t), type: t, power: 1 }));
  let offense = 0;
  let bestMove: string | null = null;
  for (const mv of attacks) {
    const e = moveEffectiveness(chart, { type: mv.type, id: mv.id ?? undefined, category: mv.category }, foe.types, overlay);
    if (e.fails || blockedByAbility(foe.ability, e.effectiveType, e.min) || ITEM_IMMUNITIES[foe.item ?? ""]?.includes(e.effectiveType)) continue;
    const v = e.min * (mon.types.includes(e.effectiveType) ? STAB : 1) * typeBoost(overlay, e.effectiveType);
    if (v > offense) { offense = v; bestMove = mv.label; }
  }
  let threat = 0;
  let worstThreatType: TypeId | null = null;
  let worstThreatMove: string | null = null;
  const foeAttacks = (foe.moves ?? []).filter((m) => m.power > 0);
  const threats: PrepMove[] = foeAttacks.length ? foeAttacks : foe.types.map((t) => ({ id: null, label: typeLabel(t), type: t, power: 1 }));
  for (const mv of threats) {
    const e = moveEffectiveness(chart, { type: mv.type, id: mv.id ?? undefined, category: mv.category }, mon.types, overlay);
    if (e.fails) continue;
    const itemBoost = foe.item && ITEM_TYPE_BOOSTS[foe.item] === e.effectiveType ? ITEM_BOOST : 1;
    const v = e.max * typeBoost(overlay, e.effectiveType) * itemBoost * (foeAttacks.length && !foe.types.includes(e.effectiveType) ? 1 / STAB : 1);
    if (v > threat) { threat = v; worstThreatType = e.effectiveType; worstThreatMove = foeAttacks.length ? mv.label : null; }
  }
  const level = foe.level === null ? 0 : Math.min(0.5, Math.max(-1, (mon.level - foe.level) / 10));
  const value = Math.log2(Math.max(offense, FLOOR)) - Math.log2(Math.max(threat, FLOOR)) + level;
  return { value, offense, threat, bestMove, worstThreatType, worstThreatMove };
}

function blockedByAbility(ability: string | null | undefined, type: TypeId, multiplier: number) {
  if (!ability) return false;
  if (ability === "WONDERGUARD") return multiplier <= 1;
  return ABILITY_IMMUNITIES[ability]?.includes(type) ?? false;
}

const formOf = (data: GameData, species: string, form: number) => {
  const sp = data.species[species];
  return sp?.forms.find((f) => f.form === form) ?? sp?.forms[0];
};

const toPrepMove = (data: GameData, id: string): PrepMove => {
  const m = data.moves[id];
  return { id, label: m?.name ?? id, type: m?.type ?? "NORMAL", category: m?.category === "status" ? undefined : m?.category, power: m?.power ?? 0 };
};

export function toCandidate(mon: OwnedMon, data: GameData): PrepCandidate | null {
  if (mon.isEgg) return null;
  const f = formOf(data, mon.species, mon.form);
  return {
    uid: mon.uid,
    name: mon.nickname ?? f?.name ?? mon.species,
    level: mon.level,
    types: f?.types ?? [],
    order: mon.order,
    moves: mon.moves.map((id) => {
      const mv = toPrepMove(data, id);
      return id === "HIDDENPOWER" && mon.hiddenPowerType ? { ...mv, type: mon.hiddenPowerType } : mv;
    }),
  };
}

export function toFoes(trainer: TrainerView, data: GameData): PrepFoe[] {
  return trainer.mons.map((m) => {
    const f = formOf(data, m.species, m.form);
    return {
      name: f?.name ?? m.species, species: m.species, form: m.form, level: m.level ?? null, types: f?.types ?? [],
      ...(m.moves ? { moves: m.moves.map((id) => toPrepMove(data, id)) } : {}),
      ...(m.ability !== undefined ? { ability: m.ability } : {}),
      ...(m.item !== undefined ? { item: m.item } : {}),
    };
  });
}
