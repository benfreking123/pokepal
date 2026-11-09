import { expect, it } from "vitest";
import { describeOverlay } from "../web/components/FieldPicker";
import type { GameData } from "../shared/types";

const data = { types: [{ id: "ROCK", name: "Rock" }, { id: "FIRE", name: "Fire" }, { id: "WATER", name: "Water" }, { id: "DARK", name: "Dark" }, { id: "NORMAL", name: "Normal" }] } as unknown as GameData;

it("describes move-level rules in plain words", () => {
  expect(describeOverlay({
    fieldId: "X",
    moveTypeRemap: [{ from: "DARK", to: "NORMAL" }],
    secondaryTypes: [{ match: { moveType: "ROCK" }, oneOf: ["FIRE", "WATER"] }],
    failingMoveTypes: ["FIRE"],
    typeBoosts: [{ type: "WATER", factor: 1.5 }],
    notes: ["Extra note."],
    source: "t",
  }, data)).toEqual([
    "Dark moves become Normal.",
    "Rock moves also count as one of Fire or Water (varies).",
    "Fire moves fail.",
    "Water moves have 1.5× power.",
    "Extra note.",
  ]);
});
