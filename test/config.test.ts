import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { defaultPokepalDir, insideWorkingTree, loadConfig, saveCandidates } from "../server/config";

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
  expect(first).toMatchObject({ syncDir: null, stateDir: path.join(home, "AppData", "Local", "PokePal", "state"), runaFormat: { kind: "zip", entryPath: "data/Game.rxdata" } });
  await mkdir(path.join(home, "iCloudDrive", "Pokemon Reborn Sync"), { recursive: true });
  const second = await loadConfig(path.join(home, "b.json"), { USERPROFILE: home });
  expect(second.syncDir).toBe(path.join(home, "iCloudDrive", "Pokemon Reborn Sync"));
});

it("keeps backups next to the save, never inside the working tree", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "pokepal-home-"));
  const saveFile = path.join(home, "Saved Games", "Pokemon Reborn", "Game.rxdata");
  const dir = path.join(home, "Saved Games", "Pokemon Reborn", "PokePal");
  const def = await loadConfig(path.join(home, "c.json"), { USERPROFILE: home });
  expect(def.backupDir).toBe(path.join(home, "AppData", "Local", "PokePal", "backups"));
  await writeFile(path.join(home, "d.json"), JSON.stringify({ saveFile, backupDir: "backups" }));
  expect((await loadConfig(path.join(home, "d.json"), { USERPROFILE: home })).backupDir).toBe(path.join(dir, "backups"));
  await writeFile(path.join(home, "e.json"), JSON.stringify({ saveFile, backupDir: path.join(process.cwd(), "backups") }));
  expect((await loadConfig(path.join(home, "e.json"), { USERPROFILE: home })).backupDir).toBe(path.join(dir, "backups"));
  await writeFile(path.join(home, "f.json"), JSON.stringify({ saveFile, backupDir: path.join(home, "elsewhere") }));
  expect((await loadConfig(path.join(home, "f.json"), { USERPROFILE: home })).backupDir).toBe(path.join(home, "elsewhere"));
});

it("treats Windows paths as the same folder regardless of case", () => {
  const repo = "C:\\Users\\Ben\\Documents\\pokepal";
  expect(insideWorkingTree("C:\\Users\\Ben\\Documents\\PokePal\\backups", repo, "win32")).toBe(true);
  expect(insideWorkingTree("c:/users/ben/documents/POKEPAL", repo, "win32")).toBe(true);
  expect(insideWorkingTree("C:\\Users\\Ben\\Saved Games\\Pokemon Reborn\\PokePal\\backups", repo, "win32")).toBe(false);
  expect(insideWorkingTree("C:\\Users\\Ben\\Documents\\pokepal-other", repo, "win32")).toBe(false);
  expect(insideWorkingTree("/home/ben/PokePal/backups", "/home/ben/pokepal", "linux")).toBe(false);
});

it("without a detected save, falls back outside the working tree", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "pokepal-home-"));
  const local = path.join(home, "Local");
  const cfg = await loadConfig(path.join(home, "g.json"), { USERPROFILE: home, LOCALAPPDATA: local });
  expect(cfg).toMatchObject({ saveFile: null, stateDir: path.join(local, "PokePal", "state"), backupDir: path.join(local, "PokePal", "backups") });
  const inRepo = path.join(home, "repo");
  const clash = await loadConfig(path.join(home, "h.json"), { USERPROFILE: home, LOCALAPPDATA: path.join(inRepo, "Local") }, inRepo);
  expect(clash).toMatchObject({ stateDir: null, backupDir: null });
  expect(defaultPokepalDir(null, { LOCALAPPDATA: "C:\\Users\\Ben\\Documents\\PokePal\\.." }, "C:\\Users\\Ben\\Documents", "win32")).toBeNull();
  expect(defaultPokepalDir(null, { LOCALAPPDATA: "C:\\Users\\Ben\\AppData\\Local" }, "C:\\Users\\Ben\\Documents\\pokepal", "win32")).toBe(path.join("C:\\Users\\Ben\\AppData\\Local", "PokePal"));
});
