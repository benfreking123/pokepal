import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SaveMeta } from "../../shared/types";

export async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export class CopyVerifyError extends Error {}

export async function copyVerified(src: string, dest: string) {
  const srcHash = await sha256File(src);
  const tmp = `${dest}.pokepal-tmp`;
  await copyFile(src, tmp);
  if ((await sha256File(tmp)) !== srcHash) {
    await rm(tmp, { force: true });
    throw new CopyVerifyError(`Copy of ${src} did not match; nothing was replaced.`);
  }
  await rename(tmp, dest);
  if ((await sha256File(dest)) !== srcHash) throw new CopyVerifyError(`${dest} does not match ${src} after replacing it.`);
  return { sha256: srcHash, bytes: (await stat(dest)).size };
}

export interface BackupEntry { id: string; file: string; reason: string; createdAt: string; sha256: string; sourcePath: string; sizeBytes: number; meta: SaveMeta | null }

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

export async function backupFile(src: string, backupDir: string, reason: string, meta: SaveMeta | null, now = new Date()): Promise<BackupEntry> {
  await mkdir(backupDir, { recursive: true });
  const existing = new Set(await readdir(backupDir));
  let id = stamp(now);
  for (let i = 2; [...existing].some((f) => f.startsWith(`${id}_`)); i++) id = `${stamp(now)}-${i}`;
  const file = path.join(backupDir, `${id}_${reason}_${path.basename(src)}`);
  const { sha256, bytes } = await copyVerified(src, file);
  const entry: BackupEntry = { id, file, reason, createdAt: now.toISOString(), sha256, sourcePath: src, sizeBytes: bytes, meta };
  await writeFile(`${file}.json`, JSON.stringify(entry, null, 2));
  return entry;
}

export async function listBackups(backupDir: string): Promise<BackupEntry[]> {
  const files = await readdir(backupDir).catch(() => [] as string[]);
  const entries = await Promise.all(files.filter((f) => f.endsWith(".json")).map(async (f) => JSON.parse(await readFile(path.join(backupDir, f), "utf8")) as BackupEntry));
  return entries.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

export function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then((v) => (clearTimeout(t), resolve(v)), (e) => (clearTimeout(t), reject(e)));
  });
}
