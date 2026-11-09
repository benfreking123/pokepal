import { describe, expect, it } from "vitest";
import { extractMaps } from "../src/extract/maps";
import { readMarshalFile } from "../src/marshal";
import { MAPINFOS_FILE } from "../src/sources";
import path from "node:path";
import { existsSync } from "node:fs";
import { REAL } from "./real";

it("maps ids to names from MapInfos objects", () => {
  expect(extractMaps({ "1": { "@name": "Opal Ward", "@parent_id": 0 }, "2": { "@name": "Peridot Ward" } })).toEqual({ "1": "Opal Ward", "2": "Peridot Ward" });
});

// MapInfos.rxdata is binary game data that is not copied into the Cloud Agent store.
describe.runIf(REAL && existsSync(path.join(REAL, MAPINFOS_FILE)))("real install", () => {
  it("reads 895 maps", async () => {
    const maps = extractMaps((await readMarshalFile(path.join(REAL!, MAPINFOS_FILE)))[0]);
    expect(Object.keys(maps)).toHaveLength(895);
    expect(maps["240"]).toBe("Spinel Pokemon Center");
  });
});
