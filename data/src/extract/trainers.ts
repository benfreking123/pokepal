import type { RubyValue } from "../ruby/literal";

export interface TrainerMon { species: string; form: number; level: number; item: string | null; ability: string | null; moves: string[]; nature: string | null; iv: RubyValue; ev: RubyValue }
export interface TrainerEntry { key: string; trainerType: string; name: string; partyId: number; mons: TrainerMon[] }

type Obj = Record<string, RubyValue>;
const str = (v: RubyValue | undefined) => (typeof v === "string" ? v : null);

export function extractTrainers(list: RubyValue): Record<string, TrainerEntry> {
  if (!Array.isArray(list)) throw new Error("trainers: expected an array");
  const out: Record<string, TrainerEntry> = {};
  for (const raw of list) {
    const t = raw as Obj;
    const [name, trainerType, partyId] = (t.teamid as RubyValue[]) ?? [];
    if (typeof name !== "string" || typeof trainerType !== "string") continue;
    const key = `${trainerType}:${name}:${typeof partyId === "number" ? partyId : 0}`;
    const mons = ((t.mons as Obj[]) ?? []).map((m): TrainerMon => ({
      species: String(m.species),
      form: typeof m.form === "number" ? m.form : 0,
      level: typeof m.level === "number" ? m.level : 0,
      item: str(m.item),
      ability: str(m.ability),
      moves: Array.isArray(m.moves) ? m.moves.filter((x): x is string => typeof x === "string") : [],
      nature: str(m.nature),
      iv: m.iv ?? null,
      ev: m.ev ?? null,
    }));
    out[key] = { key, trainerType, name, partyId: typeof partyId === "number" ? partyId : 0, mons };
  }
  return out;
}
