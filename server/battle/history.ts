import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { BattleHistoryEntry, BattleResult } from "../../shared/types";
import type { BattleState } from "./schema";

export const HISTORY_LIMIT = 100;

const Entry = z.object({
  battleId: z.string(),
  startedAt: z.string(),
  updatedAt: z.string(),
  state: z.enum(["active", "ended"]),
  result: z.enum(["won", "lost"]).nullable(),
  trainer: z.object({ type: z.string(), name: z.string() }).nullable(),
  trainerKey: z.string().nullable(),
  field: z.object({ id: z.string(), name: z.string() }),
  foes: z.array(z.object({ name: z.string(), species: z.string(), form: z.number().int(), level: z.number().int().optional() })),
});
const HistoryFile = z.object({ version: z.literal(1), entries: z.array(Entry) });

export type StoredBattle = z.infer<typeof Entry>;

export function battleResult(s: BattleState): BattleResult | null {
  if (s.state !== "ended") return null;
  if (s.party.length > 0 && s.party.every((p) => p.fainted)) return "lost";
  if (s.foes.length > 0 && s.foes.every((f) => f.fainted)) return "won";
  return null;
}

export interface BattleHistory {
  /** Newest first. */
  entries(): StoredBattle[];
  record(state: BattleState, trainerKey: string | null): void;
  flush(): Promise<void>;
}

const validTime = (iso: string) => !Number.isNaN(new Date(iso).getTime());

export async function openBattleHistory(file: string | null, log: (msg: string) => void = () => {}): Promise<BattleHistory> {
  let list: StoredBattle[] = [];
  if (file) {
    try {
      const parsed = HistoryFile.safeParse(JSON.parse(await readFile(file, "utf8")));
      if (parsed.success) list = parsed.data.entries;
      else log("battle history ignored (invalid shape)");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") log(`battle history unreadable: ${(e as Error).message}`);
    }
  }

  let pending: Promise<void> = Promise.resolve();
  const persist = () => {
    if (!file) return;
    const text = JSON.stringify({ version: 1, entries: list }, null, 2);
    pending = pending.then(async () => {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(`${file}.tmp`, text);
      await rename(`${file}.tmp`, file);
    }).catch((e: Error) => log(`could not save battle history: ${e.message}`));
  };

  return {
    entries: () => list,
    record(state, trainerKey) {
      const now = new Date().toISOString();
      const stamp = validTime(state.updatedAt) ? state.updatedAt : now;
      const existing = list.find((e) => e.battleId === state.battleId);
      const next: StoredBattle = {
        battleId: state.battleId,
        startedAt: existing?.startedAt ?? stamp,
        updatedAt: stamp,
        state: state.state,
        result: battleResult(state) ?? (existing?.state === "ended" ? existing.result : null),
        trainer: state.trainer,
        trainerKey: trainerKey ?? existing?.trainerKey ?? null,
        field: state.field,
        foes: state.foes.length > 0
          ? state.foes.map((f) => ({ name: f.name, species: f.species, form: f.form, level: f.level }))
          : existing?.foes ?? [],
      };
      if (existing) {
        const { updatedAt: _a, ...a } = existing;
        const { updatedAt: _b, ...b } = next;
        if (JSON.stringify(a) === JSON.stringify(b)) return;
        list = list.map((e) => (e === existing ? next : e));
      } else {
        list = [next, ...list].slice(0, HISTORY_LIMIT);
      }
      persist();
    },
    flush: () => pending,
  };
}

export function historyView(entries: StoredBattle[], showLevels: boolean): BattleHistoryEntry[] {
  return entries.map((e) => ({
    battleId: e.battleId,
    startedAt: e.startedAt,
    updatedAt: e.updatedAt,
    state: e.state,
    result: e.result,
    kind: e.trainer ? "trainer" : "wild",
    trainer: e.trainer,
    trainerKey: e.trainerKey,
    field: e.field,
    foes: e.foes.map(({ level, ...f }) => (showLevels && level !== undefined ? { ...f, level } : f)),
  }));
}
