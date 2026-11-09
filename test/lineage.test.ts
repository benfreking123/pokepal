import { expect, it } from "vitest";
import { emptyLedger, type Ledger } from "../server/crossplay/ledger";
import { handOffWarnings, incomingWarnings, restoreWarnings } from "../server/crossplay/lineage";
import type { SaveMeta } from "../shared/types";

const save = (sha256: string, playtimeSeconds: number, trainerName = "Ben"): SaveMeta =>
  ({ trainerName, playtimeSeconds, badgeCount: 3, mapId: 1, mapName: null, sha256, mtimeMs: 0, sizeBytes: 1 });
const handedOff = (meta: SaveMeta): Ledger => ({ holder: "runa", handoff: { at: "2026-11-09T20:00:00.000Z", pcSha256: meta.sha256, meta }, history: [] });
const codes = (w: { code: string }[]) => w.map((x) => x.code);

it("hand-off warns about a newer or unreadable copy already in the sync folder", () => {
  expect(handOffWarnings(save("a", 100), emptyLedger(), false, null)).toEqual([]);
  expect(codes(handOffWarnings(save("a", 100), emptyLedger(), false, save("b", 500)))).toEqual(["DESTINATION_NEWER"]);
  expect(codes(handOffWarnings(save("a", 100), emptyLedger(), false, save("b", 120, "Other")))).toEqual(["DESTINATION_NEWER"]);
});

it("checks incoming saves against the hand-off, not just the PC", () => {
  const pc = save("a", 1000);
  expect(incomingWarnings(save("b", 2000), pc, handedOff(pc))).toEqual([]);
  expect(codes(incomingWarnings(save("b", 2000, "Rival"), pc, handedOff(pc)))).toEqual(["DIFFERENT_TRAINER"]);
  expect(codes(incomingWarnings(save("b", 990), pc, handedOff(pc)))).toEqual([]);
  expect(codes(incomingWarnings(save("b", 900), pc, emptyLedger()))).toEqual(["DESTINATION_NEWER"]);
});

it("warns before restoring while Runa holds the save", () => {
  const pc = save("a", 1000);
  expect(codes(restoreWarnings(save("old", 500), pc, handedOff(pc)))).toEqual(["ALREADY_HANDED_OFF", "DESTINATION_NEWER"]);
  expect(restoreWarnings(save("newer", 1500), pc, emptyLedger())).toEqual([]);
});
