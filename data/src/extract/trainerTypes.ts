import type { RubyValue } from "../ruby/literal";

export function extractTrainerTypes(hash: RubyValue): Record<string, { name: string }> {
  if (!hash || typeof hash !== "object" || Array.isArray(hash)) throw new Error("trainer types: expected a hash");
  const out: Record<string, { name: string }> = {};
  for (const [id, raw] of Object.entries(hash)) {
    const r = raw as Record<string, RubyValue>;
    out[id] = { name: typeof r.title === "string" ? r.title : typeof r.name === "string" ? r.name : id };
  }
  return out;
}
