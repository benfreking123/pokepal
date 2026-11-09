import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { battleResult, historyView, HISTORY_LIMIT, openBattleHistory } from "../server/battle/history";
import type { BattleState } from "../server/battle/schema";
import { formatWhen, historyFocus } from "../shared/history";
import type { BattleHistoryEntry, ClientBundle } from "../shared/types";

const state = (over: Partial<BattleState> = {}): BattleState => ({
  schema: 1, bridgeVersion: "1.0.0", updatedAt: "2026-11-09T20:15:03Z", battleId: "b1", state: "active", isDouble: false,
  field: { id: "GLITCH", name: "Glitch" }, trainer: { type: "LEADER_X", name: "X" },
  foes: [{ slot: 0, name: "Gengar", species: "GENGAR", form: 0, formName: null, level: 80, types: ["GHOST"], hpPercent: 100, fainted: false }],
  party: [{ species: "LUCARIO", form: 0, nickname: "Rio", level: 79, hpPercent: 64, fainted: false, active: true }], ...over,
});
const dir = () => mkdtemp(path.join(os.tmpdir(), "pokepal-history-"));

it("records each battle once, newest first, and persists it outside the repo", async () => {
  const file = path.join(await dir(), "state", "battle-history.json");
  const h = await openBattleHistory(file);
  h.record(state(), "LEADER_X:X:0");
  h.record(state({ updatedAt: "2026-11-09T20:16:00Z" }), "LEADER_X:X:0");
  h.record(state({ battleId: "b2", trainer: null, updatedAt: "2026-11-09T21:00:00Z" }), null);
  await h.flush();
  expect(h.entries().map((e) => e.battleId)).toEqual(["b2", "b1"]);
  expect(h.entries()[1].startedAt).toBe("2026-11-09T20:15:03Z");
  const reopened = await openBattleHistory(file);
  expect(reopened.entries()).toEqual(h.entries());
  expect(JSON.parse(await readFile(file, "utf8")).version).toBe(1);
});

it("works memory-only without a file and caps the log", async () => {
  const h = await openBattleHistory(null);
  for (let i = 0; i < HISTORY_LIMIT + 5; i++) h.record(state({ battleId: `b${i}` }), null);
  expect(h.entries()).toHaveLength(HISTORY_LIMIT);
  expect(h.entries()[0].battleId).toBe(`b${HISTORY_LIMIT + 4}`);
});

it("derives the result when a battle ends and keeps it", async () => {
  const fainted = (f: boolean) => ({ ...state().foes[0], fainted: f });
  expect(battleResult(state())).toBeNull();
  expect(battleResult(state({ state: "ended", foes: [fainted(true)] }))).toBe("won");
  expect(battleResult(state({ state: "ended", party: [{ ...state().party[0], fainted: true }] }))).toBe("lost");
  expect(battleResult(state({ state: "ended" }))).toBeNull();
  const h = await openBattleHistory(null);
  h.record(state({ state: "ended", foes: [fainted(true)] }), null);
  expect(h.entries()[0]).toMatchObject({ state: "ended", result: "won" });
});

it("hides foe levels when the opponent-levels spoiler is off", async () => {
  const h = await openBattleHistory(null);
  h.record(state({ trainer: null }), null);
  expect(historyView(h.entries(), true)[0].foes[0].level).toBe(80);
  expect(historyView(h.entries(), false)[0].foes[0]).not.toHaveProperty("level");
});

it("maps history rows to what the Battle panel opens", () => {
  const bundle = { trainerIndex: [{ key: "A:X:1", trainerType: "A", name: "X", label: "X", partyId: 1 }, { key: "A:X:0", trainerType: "A", name: "X", label: "X", partyId: 0 }] } as unknown as ClientBundle;
  const base: BattleHistoryEntry = { battleId: "b", startedAt: "", updatedAt: "", state: "ended", result: null, kind: "trainer", trainer: { type: "A", name: "X" }, trainerKey: null, field: { id: "INDOOR", name: "" }, foes: [] };
  expect(historyFocus(bundle, base)).toEqual({ trainerKey: "A:X:0", fieldId: "NONE", species: null });
  expect(historyFocus(bundle, { ...base, trainer: { type: "Z", name: "Z" } })).toBeNull();
  const wild = { ...base, kind: "wild" as const, trainer: null, foes: [{ name: "Rattata", species: "RATTATA", form: 0 }] };
  expect(historyFocus(bundle, wild)).toEqual({ trainerKey: null, fieldId: "NONE", species: { species: "RATTATA", form: 0 } });
});

it("formats today, yesterday and older times", () => {
  const now = new Date(2026, 10, 9, 12, 0);
  expect(formatWhen(new Date(2026, 10, 9, 8, 5).toISOString(), now)).toMatch(/^Today /);
  expect(formatWhen(new Date(2026, 10, 8, 23, 0).toISOString(), now)).toMatch(/^Yesterday /);
  expect(formatWhen(new Date(2026, 10, 1, 9, 0).toISOString(), now)).not.toMatch(/Today|Yesterday/);
});
