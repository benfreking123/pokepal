import type { RubyValue } from "../ruby/literal";

export interface SpeciesForm { form: number; formName: string | null; name: string; types: string[]; baseStats: number[]; abilities: string[]; hiddenAbility: string | null }
export interface SpeciesEntry { id: string; dexNum: number; forms: SpeciesForm[] }

type Obj = Record<string, RubyValue>;
const isObj = (v: RubyValue | undefined): v is Obj => !!v && typeof v === "object" && !Array.isArray(v) && !("$ruby" in v) && !("$const" in v);
const isFormKey = (k: string, v: RubyValue) => isObj(v) && k.includes(" ");
const str = (v: RubyValue | undefined) => (typeof v === "string" ? v : null);
const list = (v: RubyValue | undefined) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? [v] : []);

export function extractSpecies(hash: RubyValue): Record<string, SpeciesEntry> {
  if (!isObj(hash)) throw new Error("species: expected a hash");
  const out: Record<string, SpeciesEntry> = {};
  for (const [id, raw] of Object.entries(hash)) {
    if (!isObj(raw)) continue;
    const formEntries = Object.entries(raw).filter(([k, v]) => isFormKey(k, v)) as [string, Obj][];
    if (formEntries.length === 0) continue;
    const base = formEntries[0][1];
    const forms = formEntries.map(([formName, over], i): SpeciesForm => {
      const f = { ...base, ...over };
      const t1 = str(f.Type1);
      const t2 = str(f.Type2);
      return {
        form: i,
        formName: i === 0 ? null : formName,
        name: str(f.name) ?? id,
        types: [t1, t2 && t2 !== t1 ? t2 : null].filter((t): t is string => !!t),
        baseStats: Array.isArray(f.BaseStats) ? (f.BaseStats as number[]) : [],
        abilities: list(f.Abilities),
        hiddenAbility: str(f.HiddenAbility) ?? list(f.HiddenAbility)[0] ?? null,
      };
    });
    out[id] = { id, dexNum: typeof base.dexnum === "number" ? base.dexnum : 0, forms };
  }
  return out;
}
