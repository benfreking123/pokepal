import { liveFieldId, liveFoeTypes } from "../../shared/live";
import { baseStatTotal, formTypes, recommend, type RecMon } from "../../shared/prep/recommend";
import { scoreMatchup } from "../../shared/prep/score";
import { rankSwitchIns } from "../../shared/prep/switchin";
import { moveEffectiveness, NO_FIELD, typeVsType } from "../../shared/typechart";
import type { FieldOverlay, GameData, LiveBattle, SpoilerSettings } from "../../shared/types";

export const OVERLAY_SCHEMA = 1;
export const MAX_PICKS = 3;

export interface OverlayFoe { name: string; types: string[]; weak4: string[]; weak2: string[] }
export interface OverlayPick { name: string; tag: string; stay?: true }
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
  const fieldName = fieldId === "NONE" ? "" : data.fields[fieldId]?.name ?? live.field.name;

  const weakness = (name: string, types: string[]): OverlayFoe => {
    const weak4: string[] = [];
    const weak2: string[] = [];
    if (types.length) {
      for (const t of data.types) {
        const e = moveEffectiveness(data.chart, { type: t.id }, types, overlay);
        if (e.fails) continue;
        if (e.max >= 4) weak4.push(t.name);
        else if (e.max >= 2) weak2.push(t.name);
      }
    }
    return { name: clip(name), types: types.map(typeName), weak4, weak2 };
  };
  const toRec = (p: LiveBattle["party"][number], i: number): RecMon => ({
    uid: `live-${i}`, name: p.nickname || data.species[p.species]?.forms[0]?.name || p.species, level: p.level,
    types: formTypes(data, p.species, p.form), baseStatTotal: baseStatTotal(data, p.species, p.form), box: null,
  });

  if (live.incoming) {
    const inc = live.incoming;
    const types = inc.types.length ? inc.types : formTypes(data, inc.species, inc.form);
    const label = data.species[inc.species]?.forms.find((f) => f.form === inc.form)?.name ?? data.species[inc.species]?.forms[0]?.name ?? inc.species;
    const cands = live.party.map((p, i) => ({ p, mon: toRec(p, i) })).filter((x) => !x.p.fainted).map((x) => ({ mon: x.mon, hpPercent: x.p.hpPercent, active: x.p.active }));
    const ranked = rankSwitchIns(data.chart, overlay, types, cands, typeName);
    const picks: OverlayPick[] = ranked.map((r) => ({ name: clip(r.mon.name), tag: r.tag, ...(r.active ? { stay: true as const } : {}) }));
    return {
      schema: OVERLAY_SCHEMA, updatedAt: now.toISOString(), field: { id: fieldId, name: fieldName || "No field" }, incoming: true,
      rules: overlayRules(data, overlay), foes: [weakness(label, types)], ...(picks.length ? { picks } : {}),
    };
  }

  const present = live.foes.filter((f) => !f.fainted).map((f) => ({ f, types: liveFoeTypes(f, data) }));
  const foes: OverlayFoe[] = present.map(({ f, types }) => weakness(f.name, types));

  const foeInputs = present.filter((p) => p.types.length).map(({ f, types }) => ({ name: f.name, species: f.species, form: f.form, level: f.level ?? null, types }));
  const bench = live.party.map((p, i) => ({ p, mon: toRec(p, i) })).filter((x) => !x.p.fainted && !x.p.active);
  const picks: OverlayPick[] = foeInputs.length === 0 ? [] : recommend({
    chart: data.chart, overlay, fieldName, typeName, foes: foeInputs, party: bench.map((x) => x.mon), pc: [],
  }).party.slice(0, MAX_PICKS).map((r) => ({ name: clip(r.mon.name), tag: pickTag(data, overlay, r.mon, foeInputs.map((x) => x.types), typeName) }));

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

/** One short pill: what the pick shrugs off, else that it hits the foe hard, else "even". */
function pickTag(data: GameData, overlay: FieldOverlay, mon: RecMon, foeTypes: string[][], typeName: (t: string) => string): string {
  const carried = [...new Set(foeTypes.flat())];
  let resist: string | null = null;
  for (const t of carried) {
    const e = moveEffectiveness(data.chart, { type: t }, mon.types, overlay);
    if (e.fails || e.max === 0) return `immune ${typeName(t)}`;
    if (e.max < 1 && !resist) resist = t;
  }
  if (resist) return `resists ${typeName(resist)}`;
  const cand = { uid: mon.uid, name: mon.name, level: mon.level, types: mon.types, moves: [], order: 0 };
  const hits = foeTypes.some((types) => scoreMatchup(data.chart, overlay, cand, { name: "", species: "", form: 0, level: null, types }).offense > 1);
  return hits ? "hits super effectively" : "even";
}
