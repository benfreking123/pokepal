import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { parseBattleState } from "../server/battle/schema";

const sample = {
  schema: 1, bridgeVersion: "1.0.0", updatedAt: "2026-11-09T20:15:03Z", battleId: "1-2", state: "active", isDouble: false,
  field: { id: "GLITCH", name: "Glitch Field" }, trainer: { type: "LEADER_X", name: "X" },
  foes: [{ slot: 0, name: "Gengar", species: "GENGAR", form: 0, formName: null, level: 80, types: ["GHOST", "POISON"], hpPercent: 100, fainted: false }],
  party: [{ species: "LUCARIO", form: 0, nickname: "Rio", level: 79, hpPercent: 64, fainted: false, active: true }],
};

it("accepts schema v1", () => {
  expect(parseBattleState(JSON.stringify(sample))).toMatchObject({ ok: true, state: { foes: [{ species: "GENGAR" }] } });
  expect(parseBattleState(JSON.stringify({ ...sample, trainer: null }))).toMatchObject({ ok: true });
});

it("rejects partial files, other schemas and foe moves", () => {
  expect(parseBattleState('{"schema":1,')).toEqual({ ok: false, reason: "invalid-json" });
  expect(parseBattleState(JSON.stringify({ ...sample, schema: 2 }))).toEqual({ ok: false, reason: "unsupported-schema", schema: 2 });
  const withMoves = { ...sample, foes: [{ ...sample.foes[0], moves: ["SHADOWBALL"] }] };
  expect(parseBattleState(JSON.stringify(withMoves))).toMatchObject({ ok: false, reason: "invalid-shape" });
});

it("accepts every captured fixture", () => {
  const dir = path.join(import.meta.dirname, "fixtures", "battle");
  const files = readdirSync(dir).filter((x) => x.endsWith(".json"));
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) {
    expect(parseBattleState(readFileSync(path.join(dir, f), "utf8")).ok, f).toBe(true);
  }
});
