import { expect, it } from "vitest";
import { compareSaves } from "../server/crossplay/compare";
import type { SaveMeta } from "../shared/types";

const m = (o: Partial<SaveMeta>): SaveMeta => ({ trainerName: "Ben", playtimeSeconds: 1000, badgeCount: 10, mapId: 1, mapName: null, sha256: "x", mtimeMs: 0, sizeBytes: 1, ...o });

it.each([
  [null, null, "unknown"],
  [m({}), null, "a"],
  [null, m({}), "b"],
  [m({ sha256: "s" }), m({ sha256: "s", playtimeSeconds: 5 }), "same"],
  [m({ trainerName: "Ben", sha256: "1" }), m({ trainerName: "Amy", sha256: "2" }), "unknown"],
  [m({ playtimeSeconds: 5000, sha256: "1" }), m({ playtimeSeconds: 1000, sha256: "2" }), "a"],
  [m({ playtimeSeconds: 1000, badgeCount: 11, sha256: "1" }), m({ playtimeSeconds: 1030, sha256: "2" }), "a"],
  [m({ playtimeSeconds: 1000, sha256: "1", mtimeMs: 1 }), m({ playtimeSeconds: 1030, sha256: "2", mtimeMs: 2 }), "b"],
] as const)("compareSaves case %#", (a, b, expected) => {
  expect(compareSaves(a, b).newer).toBe(expected);
});
