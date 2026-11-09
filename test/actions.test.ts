import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { beforeEach, expect, it } from "vitest";
import { getStatus, handOffToRuna, installOnPc, reclaimOnPc, restoreBackup, stageUpload, type CrossplayDeps } from "../server/crossplay/actions";
import { listBackups, sha256File } from "../server/crossplay/files";
import { readLedger } from "../server/crossplay/ledger";
import { listSaveEntries } from "../server/crossplay/runaZip";
import type { SaveMeta } from "../shared/types";

let root: string;
let deps: CrossplayDeps;
let running = false;
let clock = 0;

const meta = async (file: string): Promise<SaveMeta> => {
  const txt = await readFile(file, "utf8");
  const playtimeSeconds = Number(/pt=(\d+)/.exec(txt)?.[1] ?? NaN);
  if (Number.isNaN(playtimeSeconds)) throw new Error("not a save");
  return { trainerName: /name=(\w+)/.exec(txt)?.[1] ?? "", playtimeSeconds, badgeCount: 0, mapId: 0, mapName: null, sha256: await sha256File(file), mtimeMs: 0, sizeBytes: txt.length };
};
const zipOf = (content: string, entry = "Game.rxdata") => {
  const z = new AdmZip();
  z.addFile(entry, Buffer.from(content));
  return z.toBuffer();
};
const ledgerFile = () => path.join(deps.stateDir, "handoff.json");

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "pokepal-swap-"));
  for (const d of ["pc", "state", "backups", "tmp"]) await mkdir(path.join(root, d));
  running = false;
  deps = {
    saveFile: path.join(root, "pc", "Game.rxdata"), stateDir: path.join(root, "state"), backupDir: path.join(root, "backups"),
    syncDir: null, tmpDir: path.join(root, "tmp"), runaFormat: { kind: "rxdata" },
    readMeta: meta, isGameRunning: async () => running, now: () => new Date(Date.UTC(2026, 10, 9, 20, 0, clock++)),
  };
  await writeFile(deps.saveFile, "pt=5000;name=Ben");
});

it("hands off: outbox copy, backup, ledger says Runa holds the save", async () => {
  const r = await handOffToRuna(deps, { expectedSha256: await sha256File(deps.saveFile) });
  expect(r.downloadName).toBe("Game.rxdata");
  expect(await readFile(path.join(deps.stateDir, "outbox", "Game.rxdata"), "utf8")).toBe("pt=5000;name=Ben");
  expect(r.backup.reason).toBe("pc-at-handoff");
  expect(r.syncCopied).toBe(false);
  const ledger = await readLedger(ledgerFile());
  expect(ledger.holder).toBe("runa");
  expect(ledger.handoff?.meta.playtimeSeconds).toBe(5000);
});

it("hand-off needs confirmation while the game runs or when already handed off", async () => {
  const sha = await sha256File(deps.saveFile);
  running = true;
  await expect(handOffToRuna(deps, { expectedSha256: sha })).rejects.toMatchObject({ code: "NEEDS_CONFIRMATION", warnings: [{ code: "GAME_RUNNING" }] });
  await handOffToRuna(deps, { expectedSha256: sha, acceptWarnings: true });
  running = false;
  await expect(handOffToRuna(deps, { expectedSha256: sha })).rejects.toMatchObject({ warnings: [{ code: "ALREADY_HANDED_OFF" }] });
  await expect(handOffToRuna(deps, { expectedSha256: "stale" })).rejects.toMatchObject({ code: "FILE_CHANGED" });
});

it("hand-off also writes the iCloud folder and a Runa-layout zip when configured", async () => {
  deps.syncDir = path.join(root, "sync");
  await mkdir(deps.syncDir);
  deps.runaFormat = { kind: "zip", entryPath: "data/Game.rxdata" };
  const r = await handOffToRuna(deps, { expectedSha256: await sha256File(deps.saveFile) });
  expect(r).toMatchObject({ downloadName: "pokepal_to_runa.zip", syncCopied: true });
  expect(await readFile(path.join(deps.syncDir, "Game.rxdata"), "utf8")).toBe("pt=5000;name=Ben");
  expect(listSaveEntries(path.join(deps.syncDir, "pokepal_to_runa.zip"))).toEqual(["data/Game.rxdata"]);
});

it("rejects bad uploads and keeps nothing", async () => {
  await expect(stageUpload(deps, "notes.txt", Buffer.from("x"))).rejects.toMatchObject({ code: "BAD_UPLOAD" });
  await expect(stageUpload(deps, "reborn_saves.zip", zipOf("x", "readme.txt"))).rejects.toMatchObject({ code: "BAD_UPLOAD" });
  await expect(stageUpload(deps, "Game.rxdata", Buffer.from("garbage"))).rejects.toMatchObject({ code: "PARSE_FAILED" });
  expect(await readdir(path.join(deps.stateDir, "inbox"))).toEqual([]);
});

it("round trip: hand off, upload Runa export with more playtime, install cleanly", async () => {
  await handOffToRuna(deps, { expectedSha256: await sha256File(deps.saveFile) });
  const item = await stageUpload(deps, "../../reborn_saves.zip", zipOf("pt=7000;name=Ben"));
  expect(item).toMatchObject({ source: "upload", entry: "Game.rxdata", warnings: [], error: null });
  expect(item.fileName).toMatch(/^\d{8}T\d{9}_reborn_saves\.zip$/);
  const status = await getStatus(deps);
  expect(status.incoming.map((i) => i.id)).toEqual([item.id]);
  running = true;
  await expect(installOnPc(deps, { id: item.id, entry: item.entry, expectedSha256: item.meta!.sha256 })).rejects.toMatchObject({ code: "GAME_RUNNING" });
  running = false;
  const r = await installOnPc(deps, { id: item.id, entry: item.entry, expectedSha256: item.meta!.sha256 });
  expect(await readFile(deps.saveFile, "utf8")).toBe("pt=7000;name=Ben");
  expect(r.backup?.reason).toBe("pc-before-install");
  expect((await readLedger(ledgerFile())).holder).toBe("pc");
  expect(existsSync(path.join(deps.stateDir, "inbox", item.fileName))).toBe(false);
});

it("flags old exports, PC play after hand-off, and saves with no new progress", async () => {
  await handOffToRuna(deps, { expectedSha256: await sha256File(deps.saveFile) });
  const old = await stageUpload(deps, "reborn_saves.zip", zipOf("pt=3000;name=Ben"));
  expect(old.warnings.map((w) => w.code)).toEqual(["OLDER_THAN_HANDOFF", "DESTINATION_NEWER"]);
  const same = await stageUpload(deps, "reborn_saves.zip", zipOf("pt=5000;name=Ben"));
  expect(same.warnings.map((w) => w.code)).toEqual(["NO_NEW_PROGRESS"]);
  await writeFile(deps.saveFile, "pt=5100;name=Ben");
  const newer = await stageUpload(deps, "reborn_saves.zip", zipOf("pt=9000;name=Ben"));
  expect(newer.warnings.map((w) => w.code)).toEqual(["PC_CHANGED_SINCE_HANDOFF"]);
  await expect(installOnPc(deps, { id: newer.id, entry: newer.entry, expectedSha256: newer.meta!.sha256 })).rejects.toMatchObject({ code: "NEEDS_CONFIRMATION" });
  await installOnPc(deps, { id: newer.id, entry: newer.entry, expectedSha256: newer.meta!.sha256, acceptWarnings: true });
  expect(await readFile(deps.saveFile, "utf8")).toBe("pt=9000;name=Ben");
  const backups = await listBackups(deps.backupDir);
  expect(await readFile(backups[0].file, "utf8")).toBe("pt=5100;name=Ben");
});

it("sees Runa exports in the iCloud folder and rejects path tricks", async () => {
  deps.syncDir = path.join(root, "sync");
  await mkdir(deps.syncDir);
  await writeFile(path.join(deps.syncDir, "reborn_saves.zip"), zipOf("pt=6000;name=Ben"));
  const status = await getStatus(deps);
  expect(status.incoming).toMatchObject([{ id: "icloud:reborn_saves.zip", source: "icloud", meta: { playtimeSeconds: 6000 } }]);
  await expect(installOnPc(deps, { id: "upload:../pc/Game.rxdata", entry: null, expectedSha256: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await installOnPc(deps, { id: "icloud:reborn_saves.zip", entry: "Game.rxdata", expectedSha256: status.incoming[0].meta!.sha256 });
  expect(existsSync(path.join(deps.syncDir, "reborn_saves.zip"))).toBe(true);
});

it("restores a backup and records it", async () => {
  await handOffToRuna(deps, { expectedSha256: await sha256File(deps.saveFile) });
  await writeFile(deps.saveFile, "pt=6000;name=Ben");
  const [b] = await listBackups(deps.backupDir);
  await expect(restoreBackup(deps, { backupId: b.id, expectedSha256: b.sha256 })).rejects.toMatchObject({ code: "NEEDS_CONFIRMATION" });
  await restoreBackup(deps, { backupId: b.id, expectedSha256: b.sha256, acceptWarnings: true });
  expect(await readFile(deps.saveFile, "utf8")).toBe("pt=5000;name=Ben");
  const ledger = await readLedger(ledgerFile());
  expect(ledger.holder).toBe("pc");
  expect(ledger.history.map((h) => h.event)).toEqual(["handoff", "restore"]);
});

it("takes the save back on the PC after confirmation", async () => {
  await expect(reclaimOnPc(deps, { acceptWarnings: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await handOffToRuna(deps, { expectedSha256: await sha256File(deps.saveFile) });
  await expect(reclaimOnPc(deps, {})).rejects.toMatchObject({ code: "NEEDS_CONFIRMATION" });
  await reclaimOnPc(deps, { acceptWarnings: true });
  const ledger = await readLedger(ledgerFile());
  expect(ledger).toMatchObject({ holder: "pc", handoff: null });
  expect(ledger.history.map((h) => h.event)).toEqual(["handoff", "reclaim"]);
});
