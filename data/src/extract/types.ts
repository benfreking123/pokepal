import type { RubyValue } from "../ruby/literal";

export interface TypesFile {
  types: { id: string; name: string }[];
  chart: Record<string, Record<string, number>>;
}

const asList = (v: RubyValue | undefined): string[] => (Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : []);

export function extractTypes(hash: RubyValue): TypesFile {
  if (!hash || typeof hash !== "object" || Array.isArray(hash)) throw new Error("types: expected a hash");
  const types: TypesFile["types"] = [];
  const chart: TypesFile["chart"] = {};
  const set = (atk: string, def: string, m: number) => ((chart[atk] ??= {})[def] = m);
  for (const [id, raw] of Object.entries(hash)) {
    const t = raw as Record<string, RubyValue>;
    types.push({ id, name: typeof t.name === "string" ? t.name : id });
    for (const atk of asList(t.weaknesses)) set(atk, id, 2);
    for (const atk of asList(t.resistances)) set(atk, id, 0.5);
    for (const atk of asList(t.immunities)) set(atk, id, 0);
  }
  return { types, chart };
}
