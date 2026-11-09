import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile, utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { expect, it } from "vitest";
import { extractEntry, findRunaExports, listSaveEntries } from "../server/crossplay/runaZip";

it("finds the newest zip, lists save entries and extracts one", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pokepal-zip-"));
  const zip = new AdmZip();
  zip.addFile("data/Game.rxdata", Buffer.from("main"));
  zip.addFile("data/Game_2.rxdata", Buffer.from("slot2"));
  zip.addFile("backups/data/Game - Bean - 18 - 21h 56m - 5 badges - Tanzan Cove.rxdata", Buffer.from("backup"));
  zip.addFile("Using these saves on a PC.txt", Buffer.from("x"));
  const older = path.join(dir, "reborn_saves.zip"), newer = path.join(dir, "reborn_saves (1).zip");
  zip.writeZip(older); zip.writeZip(newer);
  await utimes(older, new Date(2026, 0, 1), new Date(2026, 0, 1));
  await writeFile(path.join(dir, "other.zip"), "");
  expect((await findRunaExports(dir)).map((x) => x.path)).toEqual([newer]);
  const phoneOld = path.join(dir, "reborn_from_phone_2026-11-09_0900.zip"), phoneNew = path.join(dir, "reborn_from_phone_2026-11-09_1000.zip");
  zip.writeZip(phoneOld); zip.writeZip(phoneNew); zip.writeZip(path.join(dir, "pokepal_to_runa.zip"));
  await utimes(phoneOld, new Date(2026, 10, 9, 9), new Date(2026, 10, 9, 9));
  await utimes(phoneNew, new Date(2026, 10, 9, 10), new Date(2026, 10, 9, 10));
  expect((await findRunaExports(dir)).map((x) => path.basename(x.path))).toEqual(["reborn_from_phone_2026-11-09_1000.zip", "reborn_saves (1).zip"]);
  expect(listSaveEntries(newer)).toEqual(["data/Game.rxdata", "data/Game_2.rxdata"]);
  const out = await extractEntry(newer, "data/Game.rxdata", dir);
  expect(await readFile(out, "utf8")).toBe("main");
});

it.runIf(existsSync("test/fixtures/runa/reborn_saves.zip"))("lists the save in the real Runa export fixture", () => {
  expect(listSaveEntries("test/fixtures/runa/reborn_saves.zip")).toEqual(["data/Game.rxdata"]);
});
