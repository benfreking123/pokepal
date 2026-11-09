import { expect, it } from "vitest";
import { foeCardData, weaknessesOf } from "../shared/prep/foeCard";
import type { RecMon } from "../shared/prep/recommend";
import { NO_FIELD } from "../shared/typechart";
import type { BaseChart, FieldOverlay, TypeId } from "../shared/types";

const typeIds: TypeId[] = ["NORMAL", "FIRE", "WATER", "GRASS"];
const chart = Object.fromEntries(typeIds.map((a) => [a, Object.fromEntries(typeIds.map((d) => [d, 1]))])) as BaseChart;
chart.GRASS.WATER = 2; chart.FIRE.WATER = 0.5; chart.WATER.WATER = 0.5; chart.GRASS.GRASS = 0.5; chart.FIRE.GRASS = 2;
const mon = (uid: string, types: TypeId[], level = 50, box: string | null = null): RecMon => ({ uid, name: uid, level, types, baseStatTotal: 500, box });
const foe = { name: "Squirt", species: "SQUIRTLE", form: 0, level: 50, types: ["WATER"] as TypeId[] };
const base = { chart, overlay: NO_FIELD, fieldName: "", typeName: (t: string) => t, typeIds, foe };

it("lists 2x weaknesses, honouring the field overlay", () => {
  expect(weaknessesOf(chart, NO_FIELD, typeIds, ["WATER"])).toEqual([{ type: "GRASS", x: 2 }]);
  const boosted: FieldOverlay = { ...NO_FIELD, fieldId: "X", typeChanges: [{ type: "FIRE", against: "WATER", multiplier: 2 }] } as unknown as FieldOverlay;
  expect(Array.isArray(weaknessesOf(chart, boosted, typeIds, ["WATER"]))).toBe(true);
});

it("picks the top two healthy counters and only a clearly better PC mon", () => {
  const party = [mon("Fire", ["FIRE"]), mon("Leaf", ["GRASS"]), mon("Norm", ["NORMAL"])];
  const d = foeCardData({ ...base, party, pc: [mon("Bulb", ["GRASS"], 50, "Box 1")] });
  expect(d.best.map((c) => c.mon.uid)).toEqual(["Leaf", "Norm"]);
  expect(d.best[0].pill?.kind).toBe("good");
  expect(d.pc).toBeNull();
  const weak = foeCardData({ ...base, party: [mon("Fire", ["FIRE"])], pc: [mon("Leaf", ["GRASS"], 50, "Box 2")] });
  expect(weak.pc?.mon.box).toBe("Box 2");
});

it("marks a foe with unknown types", () => {
  const d = foeCardData({ ...base, foe: { ...foe, types: [] }, party: [mon("Leaf", ["GRASS"])], pc: [] });
  expect(d).toMatchObject({ unknown: true, best: [], pc: null });
});
