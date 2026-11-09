import { expect, it } from "vitest";
import { validateBosses, validateOverlays } from "../src/curated";

const ctx = { fieldIds: new Set(["GLITCH"]), typeIds: new Set(["GHOST", "PSYCHIC", "NORMAL"]), moveIds: new Set<string>() };

it("accepts a valid overlay", () => {
  const ok = [{ fieldId: "GLITCH", overrides: [{ attack: "GHOST", defend: "PSYCHIC", multiplier: 0 }], notes: [], source: "x" }];
  expect(validateOverlays(ok, ctx)).toHaveLength(1);
});

it("lists every unknown id", () => {
  const bad = [{ fieldId: "NOPE", overrides: [{ attack: "LASER", defend: "PSYCHIC", multiplier: 0 }], notes: [], source: "x" }];
  expect(() => validateOverlays(bad, ctx)).toThrow(/NOPE[\s\S]*LASER/);
});

it("rejects a secondary rule with both addType and oneOf", () => {
  const bad = [{ fieldId: "GLITCH", secondaryTypes: [{ match: { moveType: "GHOST" }, addType: "NORMAL", oneOf: ["NORMAL"] }], notes: [], source: "x" }];
  expect(() => validateOverlays(bad, ctx)).toThrow(/exactly one of addType or oneOf/);
});

it("validates boss trainer keys and fields", () => {
  const ctx = { fieldIds: new Set(["GLITCH"]), trainerKeys: new Set(["LEADER_X:X:0"]) };
  const ok = [{ id: "x", name: "X", group: "gym", order: 1, variants: [{ label: "Default", trainerKey: "LEADER_X:X:0" }], fieldId: "GLITCH", doubles: false, notes: [], source: "wiki" }];
  expect(validateBosses(ok, ctx)).toHaveLength(1);
  const bad = [{ ...ok[0], variants: [{ label: "Default", trainerKey: "NOPE:N:0" }], fieldId: "MOON" }];
  expect(() => validateBosses(bad, ctx)).toThrow(/NOPE:N:0[\s\S]*MOON/);
  expect(() => validateBosses([ok[0], ok[0]], ctx)).toThrow(/duplicate id x/);
});
