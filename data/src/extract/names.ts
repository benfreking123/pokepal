import type { RubyValue } from "../ruby/literal";

export function extractNames(hash: RubyValue): Record<string, { name: string; description: string }> {
  if (!hash || typeof hash !== "object" || Array.isArray(hash)) throw new Error("names: expected a hash");
  const out: Record<string, { name: string; description: string }> = {};
  for (const [id, raw] of Object.entries(hash)) {
    const r = raw as Record<string, RubyValue>;
    out[id] = { name: typeof r.name === "string" ? r.name : id, description: typeof r.desc === "string" ? r.desc : "" };
  }
  return out;
}
