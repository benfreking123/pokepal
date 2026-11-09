import { z } from "zod";
import type { LiveBattleBase } from "../../shared/types";

const Foe = z.object({
  slot: z.number().int(), name: z.string(), species: z.string(), form: z.number().int(), formName: z.string().nullable(),
  level: z.number().int(), types: z.array(z.string()), hpPercent: z.number(), fainted: z.boolean(),
}).strict();
const PartyMon = z.object({
  species: z.string(), form: z.number().int(), nickname: z.string(), level: z.number().int(), hpPercent: z.number(), fainted: z.boolean(), active: z.boolean(),
}).strict();

const Incoming = z.object({ slot: z.number().int(), species: z.string(), form: z.number().int(), level: z.number().int(), types: z.array(z.string()) }).strict();

export const BattleStateSchema = z.object({
  schema: z.literal(1), bridgeVersion: z.string(), updatedAt: z.string(), battleId: z.string(),
  state: z.enum(["active", "ended"]), isDouble: z.boolean(),
  field: z.object({ id: z.string(), name: z.string() }),
  trainer: z.object({ type: z.string(), name: z.string() }).nullable(),
  foes: z.array(Foe), party: z.array(PartyMon), incoming: Incoming.nullable().optional(),
});
export type BattleState = z.infer<typeof BattleStateSchema>;
// The shared type the browser uses must stay identical to what the server validates.
const sameShape: (s: BattleState) => LiveBattleBase = (s) => s;
void sameShape;

export type ParseResult =
  | { ok: true; state: BattleState }
  | { ok: false; reason: "invalid-json" | "unsupported-schema" | "invalid-shape"; schema?: unknown };

export function parseBattleState(text: string): ParseResult {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, reason: "invalid-json" }; }
  const schema = (raw as { schema?: unknown })?.schema;
  if (schema !== 1) return { ok: false, reason: "unsupported-schema", schema };
  const r = BattleStateSchema.safeParse(raw);
  return r.success ? { ok: true, state: r.data } : { ok: false, reason: "invalid-shape" };
}
