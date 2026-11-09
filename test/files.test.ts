import { mkdtemp, readFile, writeFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, expect, it } from "vitest";
import { backupFile, copyVerified, listBackups, sha256File, withTimeout } from "../server/crossplay/files";

let dir: string;
beforeEach(async () => { dir = await mkdtemp(path.join(os.tmpdir(), "pokepal-")); });

it("copies with matching hashes and leaves no temp file", async () => {
  const src = path.join(dir, "a.rxdata"), dest = path.join(dir, "b.rxdata");
  await writeFile(src, "save-v1");
  await writeFile(dest, "old");
  const r = await copyVerified(src, dest);
  expect(await readFile(dest, "utf8")).toBe("save-v1");
  expect(r.sha256).toBe(await sha256File(src));
  expect((await readdir(dir)).sort()).toEqual(["a.rxdata", "b.rxdata"]);
});

it("backs up with timestamped name and sidecar, listed newest first", async () => {
  const src = path.join(dir, "Game.rxdata");
  await writeFile(src, "x");
  const backups = path.join(dir, "backups");
  const a = await backupFile(src, backups, "pc-before-load-runa", null, new Date(2026, 10, 9, 20, 15, 3));
  const b = await backupFile(src, backups, "pc-before-load-runa", null, new Date(2026, 10, 9, 20, 15, 3));
  expect(path.basename(a.file)).toBe("20261109-201503_pc-before-load-runa_Game.rxdata");
  expect(path.basename(b.file)).toBe("20261109-201503-2_pc-before-load-runa_Game.rxdata");
  const list = await listBackups(backups);
  expect(list.map((e) => e.id)).toEqual([b.id, a.id]);
  expect(list[0]).toMatchObject({ reason: "pc-before-load-runa", sourcePath: src, sizeBytes: 1 });
});

it("listBackups on a missing dir is empty", async () => {
  expect(await listBackups(path.join(dir, "none"))).toEqual([]);
});

it("withTimeout rejects with the message", async () => {
  await expect(withTimeout(new Promise(() => {}), 20, "iCloud slow")).rejects.toThrow("iCloud slow");
});
