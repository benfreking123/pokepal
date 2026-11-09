import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { loadConfig, saveCandidates } from "../server/config";

it("lists save candidates in priority order", () => {
  const env = { USERPROFILE: "C:/Users/Ben", APPDATA: "C:/Users/Ben/AppData/Roaming" };
  expect(saveCandidates(env, "C:/Games/Reborn")).toEqual([
    path.join("C:/Users/Ben", "Saved Games", "Pokemon Reborn", "Game.rxdata"),
    path.join("C:/Users/Ben/AppData/Roaming", "Pokemon Reborn", "Game.rxdata"),
    path.join("C:/Games/Reborn", "Game.rxdata"),
  ]);
  expect(saveCandidates(env, null)).toHaveLength(2);
});

it("autodetects folders, using the iCloud folder only when it exists", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "pokepal-home-"));
  const first = await loadConfig(path.join(home, "a.json"), { USERPROFILE: home });
  expect(first).toMatchObject({ syncDir: null, stateDir: path.join(home, "Documents", "PokePal", "state"), runaFormat: { kind: "zip", entryPath: "data/Game.rxdata" } });
  await mkdir(path.join(home, "iCloudDrive", "Pokemon Reborn Sync"), { recursive: true });
  const second = await loadConfig(path.join(home, "b.json"), { USERPROFILE: home });
  expect(second.syncDir).toBe(path.join(home, "iCloudDrive", "Pokemon Reborn Sync"));
});
