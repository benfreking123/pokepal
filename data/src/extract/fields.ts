import type { RubyValue } from "../ruby/literal";

export interface FieldEntry {
  id: string;
  name: string;
  description: string;
  fieldAppSwitch: number | null;
  rules: { secondaryTypes?: { match: { moveType: string }; addType: string }[]; typeBoosts?: { type: string; factor: number }[]; failingMoveTypes?: string[] };
  raw: RubyValue;
}

type Obj = Record<string, RubyValue>;
const isObj = (v: RubyValue | undefined): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const strings = (v: RubyValue) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function extractFields(hash: RubyValue): Record<string, FieldEntry> {
  if (!isObj(hash)) throw new Error("fields: expected a hash");
  const out: Record<string, FieldEntry> = {};
  for (const [id, raw] of Object.entries(hash)) {
    if (!isObj(raw)) continue;
    const rules: FieldEntry["rules"] = {};
    if (isObj(raw.typeBoosts)) {
      const boosts = Object.entries(raw.typeBoosts).flatMap(([factor, types]) => strings(types).map((type) => ({ type, factor: Number(factor) })));
      const failing = boosts.filter((b) => b.factor === 0).map((b) => b.type);
      if (failing.length) rules.failingMoveTypes = failing;
      if (boosts.some((b) => b.factor !== 0)) rules.typeBoosts = boosts.filter((b) => b.factor !== 0);
    }
    if (isObj(raw.typeAddOns)) {
      rules.secondaryTypes = Object.entries(raw.typeAddOns).flatMap(([addType, moveTypes]) => strings(moveTypes).map((moveType) => ({ match: { moveType }, addType })));
    }
    const msg = Array.isArray(raw.fieldMessage) ? raw.fieldMessage.find((m) => typeof m === "string") : raw.fieldMessage;
    const fieldAppSwitch = typeof raw.fieldAppSwitch === "number" ? raw.fieldAppSwitch : null;
    out[id] = { id, name: typeof raw.name === "string" ? raw.name : id, description: typeof msg === "string" ? msg : "", fieldAppSwitch, rules, raw };
  }
  return out;
}
