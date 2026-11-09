import type { RubyValue } from "../ruby/literal";

export interface MoveEntry { id: string; name: string; type: string; category: "physical" | "special" | "status"; power: number; accuracy: number; pp: number; target: string | null; description: string }

const num = (v: RubyValue | undefined) => (typeof v === "number" ? v : 0);
const str = (v: RubyValue | undefined) => (typeof v === "string" ? v : null);

export function extractMoves(hash: RubyValue): Record<string, MoveEntry> {
  if (!hash || typeof hash !== "object" || Array.isArray(hash)) throw new Error("moves: expected a hash");
  const out: Record<string, MoveEntry> = {};
  for (const [id, raw] of Object.entries(hash)) {
    const m = raw as Record<string, RubyValue>;
    const cat = str(m.category)?.toLowerCase();
    out[id] = {
      id,
      name: str(m.name) ?? id,
      type: str(m.type) ?? "NORMAL",
      category: cat === "physical" || cat === "special" ? cat : "status",
      power: num(m.basedamage),
      accuracy: num(m.accuracy),
      pp: num(m.maxpp),
      target: str(m.target),
      description: str(m.desc) ?? "",
    };
  }
  return out;
}
