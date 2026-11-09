import { describe, expect, it } from "vitest";
import { extractNames } from "../src/extract/names";
import { loadReal, REAL } from "./real";

it("keeps name and description", () => {
  expect(extractNames({ LEVITATE: { name: "Levitate", desc: "Immune to Ground." } })).toEqual({
    LEVITATE: { name: "Levitate", description: "Immune to Ground." },
  });
});

describe.runIf(REAL)("real install", () => {
  it("finds STENCH and LEFTOVERS", async () => {
    expect(extractNames(await loadReal("abilities")).STENCH).toBeDefined();
    expect(extractNames(await loadReal("items")).LEFTOVERS).toBeDefined();
  });
});
