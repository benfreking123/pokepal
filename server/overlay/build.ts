import { liveFieldId, liveFoeTypes } from "../../shared/live";
import { baseStatTotal, formTypes, type RecMon } from "../../shared/prep/recommend";
import type { PrepMove } from "../../shared/prep/score";
import { rankSwitchIns, type SwitchCandidate, type SwitchPick } from "../../shared/prep/switchin";
import { moveEffectiveness, NO_FIELD, typeVsType } from "../../shared/typechart";
import type { FieldOverlay, GameData, LiveBattle, SpoilerSettings } from "../../shared/types";

export const OVERLAY_SCHEMA = 1;

export interface OverlayFoe { name: string; types: string[]; weak4: string[]; weak2: string[] }
/**
 * One row of the bring-in list. `def` is what the foe's types do to it (resist, immune, weak or even, with the type that
 * matters), `off` its best actual move against the foe (`m` is missing when its moves are not known), `note` Speed when
 * the picks tie on defence, and `stay` marks the Pokémon already out.
 */
export interface OverlayPick {
  name: string; hp: number;
  def: { k: "immune" | "resist" | "weak" | "even"; t?: string };
  off?: { m?: string; x: number; t: string };
  note?: "faster" | "slower"; stay?: true;
}
/** Compact type rules for the fight menu's move markers: the mod multiplies these cells for the foe's types. */
export interface OverlayRules {
  /** Attack type to defend type to multiplier, only cells that are not 1, with the field's overrides and inversion applied. */
  chart: Record<string, Record<string, number>>;
  /** Attacks of `from` count as `to`. */
  remap: { from: string; to: string }[];
  /** Attack types that do nothing on this field. */
  failing: string[];
  /** Attacks that gain a second type: `on` is the attack type, `ids` and `cat` narrow it, `add` or `oneOf` is the extra type. */
  secondary: { on?: string; ids?: string[]; cat?: string; add?: string; oneOf?: string[] }[];
}
export interface Overlay {
  schema: 1;
  updatedAt: string;
  field: { id: string; name: string };
  /** True when `foes` holds the foe a trainer has just announced, not the one on the field, and `picks` is who to bring in. */
  incoming?: true;
  rules: OverlayRules;
  foes: OverlayFoe[];
  picks?: OverlayPick[];
}

const SHORT_NAME = 12;
const speedStat = (base: number, level: number) => Math.floor(((2 * base + 31) * level) / 100) + 5;
const clip = (s: string) => (s.length > SHORT_NAME ? `${s.slice(0, SHORT_NAME - 1)}…` : s);

/** The field's type rules, unless "Field effect details" is hidden and its Field Notes are not found yet. */
export function overlayFor(data: GameData, fieldId: string, settings: SpoilerSettings, found: ReadonlySet<string>): FieldOverlay {
  const hidden = !settings.fieldDetails && !found.has(fieldId);
  return (!hidden && data.overlays[fieldId]) || NO_FIELD;
}

/** Content for the in-game panel, or null when no battle is being shown. Applies the same spoiler rules as the web app. */
export function buildOverlay(live: LiveBattle, data: GameData, settings: SpoilerSettings, found: ReadonlySet<string>, now = new Date()): Overlay | null {
  if (live.state !== "active") return null;
  const fieldId = liveFieldId(live.field.id);
  const overlay = overlayFor(data, fieldId, settings, found);
  const typeName = (t: string) => data.types.find((x) => x.id === t)?.name ?? t;
  const moveOf = (id: string): PrepMove | null => {
    const m = data.moves[id];
    return m ? { id: m.id, label: m.name, type: m.type, category: m.category === "status" ? undefined : m.category, power: m.category === "status" ? 0 : m.power } : null;
  };
  const fieldName = fieldId === "NONE" ? "" : data.fields[fieldId]?.name ?? live.field.name;

  const weakness = (name: string, types: string[]): OverlayFoe => {
    const weak4: string[] = [];
    const weak2: string[] = [];
    if (types.length) {
      for (const t of data.types) {
        const e = moveEffectiveness(data.chart, { type: t.id }, types, overlay);
        if (e.fails) continue;
        if (e.max >= 4) weak4.push(t.id);
        else if (e.max >= 2) weak2.push(t.id);
      }
    }
    return { name: clip(name), types, weak4, weak2 };
  };
  const toRec = (p: LiveBattle["party"][number], i: number): RecMon => ({
    uid: `live-${i}`, name: p.nickname || data.species[p.species]?.forms[0]?.name || p.species, level: p.level,
    types: formTypes(data, p.species, p.form), baseStatTotal: baseStatTotal(data, p.species, p.form), box: null,
  });
  const candidates = (bench: boolean): SwitchCandidate[] => live.party
    .map((p, i) => ({ p, mon: toRec(p, i) }))
    .filter((x) => !x.p.fainted && !(bench && x.p.active))
    .map((x) => ({
      mon: x.mon, hpPercent: x.p.hpPercent, active: x.p.active, speed: x.p.speed || null,
      ...(x.p.moves ? { moves: x.p.moves.map(moveOf).filter((m): m is PrepMove => m !== null) } : {}),
    }));
  const foeSpeed = (species: string, form: number, level: number | undefined) => {
    const base = data.species[species]?.forms.find((f) => f.form === form)?.baseStats[5] ?? data.species[species]?.forms[0]?.baseStats[5];
    return base && level ? speedStat(base, level) : null;
  };
  const toPick = (r: SwitchPick): OverlayPick => ({
    name: clip(r.mon.name), hp: Math.round(r.hpPercent),
    def: { k: r.defence.kind, ...(r.defence.type ? { t: r.defence.type } : {}) },
    ...(r.offence ? { off: { ...(r.offence.move ? { m: r.offence.move } : {}), x: r.offence.mult, t: r.offence.type } } : {}),
    ...(r.note ? { note: r.note } : {}), ...(r.active ? { stay: true as const } : {}),
  });

  if (live.incoming) {
    const inc = live.incoming;
    const types = inc.types.length ? inc.types : formTypes(data, inc.species, inc.form);
    const label = data.species[inc.species]?.forms.find((f) => f.form === inc.form)?.name ?? data.species[inc.species]?.forms[0]?.name ?? inc.species;
    const picks = rankSwitchIns(data.chart, overlay, types, candidates(false), typeName, { foeSpeed: foeSpeed(inc.species, inc.form, inc.level) }).map(toPick);
    return {
      schema: OVERLAY_SCHEMA, updatedAt: now.toISOString(), field: { id: fieldId, name: fieldName || "No field" }, incoming: true,
      rules: overlayRules(data, overlay), foes: [weakness(label, types)], ...(picks.length ? { picks } : {}),
    };
  }

  const present = live.foes.filter((f) => !f.fainted).map((f) => ({ f, types: liveFoeTypes(f, data) }));
  const foes: OverlayFoe[] = present.map(({ f, types }) => weakness(f.name, types));
  const known = present.filter((p) => p.types.length);
  const picks = rankSwitchIns(data.chart, overlay, [...new Set(known.flatMap((p) => p.types))], known.length ? candidates(true) : [], typeName, {
    offenceVs: known.map((p) => p.types),
    ...(known.length === 1 ? { foeSpeed: foeSpeed(known[0].f.species, known[0].f.form, known[0].f.level) } : {}),
  }).map(toPick);

  return {
    schema: OVERLAY_SCHEMA, updatedAt: now.toISOString(), field: { id: fieldId, name: fieldName || "No field" }, rules: overlayRules(data, overlay), foes,
    ...(picks.length ? { picks } : {}),
  };
}

export function overlayRules(data: GameData, overlay: FieldOverlay): OverlayRules {
  const chart: OverlayRules["chart"] = {};
  for (const a of data.types) {
    for (const d of data.types) {
      const m = typeVsType(data.chart, a.id, d.id, overlay);
      if (m !== 1) (chart[a.id] ??= {})[d.id] = m;
    }
  }
  return {
    chart,
    remap: overlay.moveTypeRemap ?? [],
    failing: overlay.failingMoveTypes ?? [],
    secondary: (overlay.secondaryTypes ?? []).map((r) => ({
      ...(r.match.moveType ? { on: r.match.moveType } : {}),
      ...(r.match.moveIds ? { ids: r.match.moveIds } : {}),
      ...(r.match.category ? { cat: r.match.category } : {}),
      ...(r.addType ? { add: r.addType } : {}),
      ...(r.oneOf ? { oneOf: r.oneOf } : {}),
    })),
  };
}
