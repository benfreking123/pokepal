import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { beforeEach, expect, it } from "vitest";
import { getStatus, handOffToRuna, installOnPc, type CrossplayDeps } from "../server/crossplay/actions";
import { listBackups, sha256File } from "../server/crossplay/files";
import { readLedger } from "../server/crossplay/ledger";
import { listSaveEntries } from "../server/crossplay/runaZip";
import type { SaveMeta } from "../shared/types";

let root: string;
let sync: string;
let deps: CrossplayDeps;
let running = false;

const meta = async (file: string): Promise<SaveMeta> => {
  const txt = await readFile(file, "utf8");
  const playtimeSeconds = Number(/pt=(\d+)/.exec(txt)?.[1] ?? NaN);
  if (Number.isNaN(playtimeSeconds)) throw new Error("not a save");
  return { trainerName: /name=(\w+)/.exec(txt)?.[1] ?? "", playtimeSeconds, badgeCount: 0, mapId: 0, mapName: null, sha256: await sha256File(file), mtimeMs: 0, sizeBytes: txt.length };
};
const zipOf = (content: string) => { const z = new AdmZip(); z.addFile("data/Game.rxdata", Buffer.from(content)); return z.toBuffer(); };
const sha = () => sha256File(deps.saveFile);

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "pokepal-sync-"));
  sync = path.join(root, "Pokemon Reborn Sync");
  for (const d of ["pc", "state", "backups", "tmp", "Pokemon Reborn Sync"]) await mkdir(path.join(root, d));
  running = false;
  deps = {
    saveFile: path.join(root, "pc", "Game.rxdata"), stateDir: path.join(root, "state"), backupDir: path.join(root, "backups"),
    syncDir: sync, tmpDir: path.join(root, "tmp"), runaFormat: { kind: "zip", entryPath: "data/Game.rxdata" },
    readMeta: meta, isGameRunning: async () => running, now: () => new Date(Date.UTC(2026, 10, 9, 20, 0, 0)),
  };
  await writeFile(deps.saveFile, "pt=5000;name=Ben");
});

it("send to iPhone writes the zip, raw save and hand-off record into the folder", async () => {
  const r = await handOffToRuna(deps, { expectedSha256: await sha() });
  expect(r.syncCopied).toBe(true);
  expect(listSaveEntries(path.join(sync, "pokepal_to_runa.zip"))).toEqual(["data/Game.rxdata"]);
  expect(await readFile(path.join(sync, "Game.rxdata"), "utf8")).toBe("pt=5000;name=Ben");
  const rec = JSON.parse(await readFile(path.join(sync, "pokepal-handoff.json"), "utf8"));
  expect(rec).toMatchObject({ writtenBy: "PokePal", trainer: "Ben", playtimeSeconds: 5000, sha256: await sha(), files: ["pokepal_to_runa.zip", "Game.rxdata"] });
  expect((await readdir(sync)).filter((n) => n.endsWith(".pokepal-tmp"))).toEqual([]);
  expect((await readLedger(path.join(deps.stateDir, "handoff.json"))).holder).toBe("runa");
  const status = await getStatus(deps);
  expect(status.incoming).toEqual([]);
  expect(status.sync?.sent?.sha256).toBe(await sha());
});

it("backs up an older Game.rxdata already in the folder before replacing it", async () => {
  await writeFile(path.join(sync, "Game.rxdata"), "pt=100;name=Ben");
  await handOffToRuna(deps, { expectedSha256: await sha() });
  const reasons = (await listBackups(deps.backupDir)).map((b) => b.reason).sort();
  expect(reasons).toEqual(["pc-at-handoff", "sync-before-send"]);
});

it("warns when the folder already holds a newer save, and nothing is written until confirmed", async () => {
  await writeFile(path.join(sync, "reborn_from_phone_2026-11-09_1000.zip"), zipOf("pt=9000;name=Ben"));
  await expect(handOffToRuna(deps, { expectedSha256: await sha() })).rejects.toMatchObject({ code: "NEEDS_CONFIRMATION", warnings: [{ code: "DESTINATION_NEWER" }] });
  expect(existsSync(path.join(sync, "pokepal_to_runa.zip"))).toBe(false);
  expect(await listBackups(deps.backupDir)).toEqual([]);
  const status = await getStatus(deps);
  expect(status.handOffWarnings.map((w) => w.code)).toEqual(["DESTINATION_NEWER"]);
});

it("a newer raw Game.rxdata in the folder also warns", async () => {
  await writeFile(path.join(sync, "Game.rxdata"), "pt=8000;name=Ben");
  await expect(handOffToRuna(deps, { expectedSha256: await sha() })).rejects.toMatchObject({ warnings: [{ code: "DESTINATION_NEWER" }] });
});

it("detects the newest phone export, ignoring PokePal's own files, and installs it without touching iCloud", async () => {
  await handOffToRuna(deps, { expectedSha256: await sha() });
  const older = path.join(sync, "reborn_from_phone_2026-11-09_0900.zip"), newer = path.join(sync, "reborn_from_phone_2026-11-09_1000.zip");
  await writeFile(older, zipOf("pt=6000;name=Ben"));
  await writeFile(newer, zipOf("pt=7000;name=Ben"));
  await utimes(older, new Date(2026, 10, 9, 9), new Date(2026, 10, 9, 9));
  await utimes(newer, new Date(2026, 10, 9, 10), new Date(2026, 10, 9, 10));
  const status = await getStatus(deps);
  expect(status.incoming.map((i) => i.fileName)).toEqual(["reborn_from_phone_2026-11-09_1000.zip"]);
  const item = status.incoming[0];
  expect(item).toMatchObject({ source: "icloud", entry: "data/Game.rxdata", warnings: [], meta: { playtimeSeconds: 7000 } });

  const before = (await readdir(sync)).sort();
  await installOnPc(deps, { id: item.id, entry: item.entry, expectedSha256: item.meta!.sha256 });
  expect(await readFile(deps.saveFile, "utf8")).toBe("pt=7000;name=Ben");
  expect((await listBackups(deps.backupDir)).map((b) => b.reason)).toContain("pc-before-install");
  expect((await readdir(sync)).sort()).toEqual(before);
  expect((await readLedger(path.join(deps.stateDir, "handoff.json"))).holder).toBe("pc");
});

it("accepts a raw rxdata export and other zip names, but not a stale copy of PokePal's own send", async () => {
  await handOffToRuna(deps, { expectedSha256: await sha() });
  await writeFile(path.join(sync, "reborn_saves.zip"), zipOf("pt=5500;name=Ben"));
  await writeFile(path.join(sync, "Export.rxdata"), "pt=6500;name=Ben");
  const names = (await getStatus(deps)).incoming.map((i) => i.fileName).sort();
  expect(names).toEqual(["Export.rxdata", "reborn_saves.zip"]);
});

it("install from the folder is refused while the game runs and changes nothing", async () => {
  await handOffToRuna(deps, { expectedSha256: await sha() });
  await writeFile(path.join(sync, "reborn_from_phone_2026-11-09_1000.zip"), zipOf("pt=7000;name=Ben"));
  const item = (await getStatus(deps)).incoming[0];
  running = true;
  await expect(installOnPc(deps, { id: item.id, entry: item.entry, expectedSha256: item.meta!.sha256 })).rejects.toMatchObject({ code: "GAME_RUNNING" });
  expect(await readFile(deps.saveFile, "utf8")).toBe("pt=5000;name=Ben");
});

it("a different trainer's export needs confirmation", async () => {
  await handOffToRuna(deps, { expectedSha256: await sha() });
  await writeFile(path.join(sync, "reborn_from_phone_2026-11-09_1000.zip"), zipOf("pt=7000;name=Sam"));
  const item = (await getStatus(deps)).incoming[0];
  expect(item.warnings.map((w) => w.code)).toContain("DIFFERENT_TRAINER");
  await expect(installOnPc(deps, { id: item.id, entry: item.entry, expectedSha256: item.meta!.sha256 })).rejects.toMatchObject({ code: "NEEDS_CONFIRMATION" });
});
