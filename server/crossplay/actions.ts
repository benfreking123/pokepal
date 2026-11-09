import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SaveMeta } from "../../shared/types";
import { backupFile, copyVerified, CopyVerifyError, listBackups, withTimeout, type BackupEntry } from "./files";
import { compareSaves } from "./compare";
import { readLedger, writeLedger, type Ledger } from "./ledger";
import { handOffWarnings, incomingWarnings, restoreWarnings, type SwapWarning } from "./lineage";
import { buildRunaZip, extractEntry, findRunaExports, listSaveEntries } from "./runaZip";

export type RunaFormat = { kind: "rxdata" } | { kind: "zip"; entryPath: string };

export interface CrossplayDeps {
  saveFile: string; stateDir: string; backupDir: string; syncDir: string | null; tmpDir: string;
  runaFormat: RunaFormat;
  readMeta: (file: string) => Promise<SaveMeta>;
  isGameRunning: () => Promise<boolean>;
  now?: () => Date;
}

export type ActionErrorCode = "NOT_FOUND" | "GAME_RUNNING" | "FILE_CHANGED" | "NEEDS_CONFIRMATION" | "BAD_UPLOAD" | "PARSE_FAILED" | "COPY_FAILED";
export class ActionError extends Error {
  constructor(public code: ActionErrorCode, message: string, public warnings: SwapWarning[] = []) { super(message); }
}

export interface IncomingSave {
  id: string; source: "upload" | "icloud"; fileName: string; receivedAtMs: number;
  entries: string[] | null; entry: string | null;
  meta: SaveMeta | null; warnings: SwapWarning[]; error: string | null;
}
export interface CrossplayStatus {
  pc: SaveMeta | null; ledger: Ledger; gameRunning: boolean;
  outbox: { downloadName: string; meta: SaveMeta } | null;
  sync: { dir: string; sent: SyncHandoffRecord | null } | null;
  handOffWarnings: SwapWarning[];
  incoming: IncomingSave[];
  errors: string[];
}

export const OUTBOX_RXDATA = "Game.rxdata";
export const OUTBOX_ZIP = "pokepal_to_runa.zip";
export const HANDOFF_JSON = "pokepal-handoff.json";
const DEFAULT_ZIP_ENTRY = "data/Game.rxdata";

export interface SyncHandoffRecord {
  writtenBy: "PokePal"; at: string; trainer: string; playtimeSeconds: number; badges: number; sha256: string; files: string[];
}
const UPLOAD_PATTERN = /\.(zip|rxdata)$/i;
const ICLOUD_TIMEOUT_MS = 10_000;
const ICLOUD_HINT = "iCloud hasn't downloaded this file yet. In File Explorer right-click the sync folder → Always keep on this device.";

const dirs = (deps: CrossplayDeps) => ({
  inbox: path.join(deps.stateDir, "inbox"),
  outbox: path.join(deps.stateDir, "outbox"),
  ledger: path.join(deps.stateDir, "handoff.json"),
});
const nowOf = (deps: CrossplayDeps) => deps.now?.() ?? new Date();
const isZip = (file: string) => /\.zip$/i.test(file);

function requireAccepted(warnings: SwapWarning[], accepted: boolean | undefined) {
  if (warnings.length > 0 && !accepted) throw new ActionError("NEEDS_CONFIRMATION", warnings.map((w) => w.message).join(" "), warnings);
}

async function install(src: string, dest: string) {
  try {
    return await copyVerified(src, dest);
  } catch (e) {
    throw new ActionError("COPY_FAILED", e instanceof CopyVerifyError ? e.message : `Copy failed: ${(e as Error).message}`);
  }
}

async function metaOrNull(deps: CrossplayDeps, file: string | null, errors: string[], slow = false): Promise<SaveMeta | null> {
  if (!file || !existsSync(file)) return null;
  try {
    return await (slow ? withTimeout(deps.readMeta(file), ICLOUD_TIMEOUT_MS, ICLOUD_HINT) : deps.readMeta(file));
  } catch (e) {
    errors.push(`${file}: ${(e as Error).message}`);
    return null;
  }
}

async function withSaveFile<T>(deps: CrossplayDeps, file: string, entry: string | null, fn: (saveFile: string) => Promise<T>): Promise<T> {
  if (!isZip(file)) return fn(file);
  if (!entry) throw new ActionError("BAD_UPLOAD", `Pick which save in ${path.basename(file)} to use.`);
  const tmp = await withTimeout(extractEntry(file, entry, deps.tmpDir), ICLOUD_TIMEOUT_MS, ICLOUD_HINT);
  try {
    return await fn(tmp);
  } finally {
    await rm(tmp, { force: true });
  }
}

function resolveIncoming(deps: CrossplayDeps, id: string): { source: "upload" | "icloud"; file: string } {
  const [source, name] = id.split(":", 2) as ["upload" | "icloud", string];
  const dir = source === "upload" ? dirs(deps).inbox : source === "icloud" ? deps.syncDir : null;
  if (!dir || !name || name !== path.basename(name) || name.startsWith(".")) throw new ActionError("NOT_FOUND", `Unknown incoming save ${id}`);
  const file = path.join(dir, name);
  if (!existsSync(file)) throw new ActionError("NOT_FOUND", `Incoming save ${name} is gone. Refresh the page.`);
  return { source, file };
}

async function describeIncoming(deps: CrossplayDeps, id: string, pc: SaveMeta | null, ledger: Ledger, entry?: string): Promise<IncomingSave> {
  const { source, file } = resolveIncoming(deps, id);
  const entries = isZip(file) ? listSaveEntries(file) : null;
  const chosen = entries ? entry ?? (entries.length === 1 ? entries[0] : null) : null;
  const item: IncomingSave = {
    id, source, fileName: path.basename(file), receivedAtMs: (await stat(file)).mtimeMs,
    entries, entry: chosen, meta: null, warnings: [], error: null,
  };
  if (entries && entries.length === 0) return { ...item, error: `No Game.rxdata found in ${item.fileName}.` };
  if (entries && !chosen) return { ...item, error: "This export has several saves; pick one." };
  try {
    const read = (f: string) => (source === "icloud" ? withTimeout(deps.readMeta(f), ICLOUD_TIMEOUT_MS, ICLOUD_HINT) : deps.readMeta(f));
    item.meta = await withSaveFile(deps, file, chosen, read);
    item.warnings = incomingWarnings(item.meta, pc, ledger);
  } catch (e) {
    item.error = (e as Error).message;
  }
  return item;
}

export async function getStatus(deps: CrossplayDeps, entries: Record<string, string> = {}): Promise<CrossplayStatus> {
  const errors: string[] = [];
  const d = dirs(deps);
  const pc = await metaOrNull(deps, deps.saveFile, errors);
  const ledger = await readLedger(d.ledger);
  const gameRunning = await deps.isGameRunning();
  const syncCopy = pc ? await newestFolderSave(deps, pc) : null;
  const outMeta = await metaOrNull(deps, path.join(d.outbox, OUTBOX_RXDATA), errors);

  const ids = (await readdir(d.inbox).catch(() => [] as string[])).filter((n) => UPLOAD_PATTERN.test(n)).sort().reverse().map((n) => `upload:${n}`);
  const sent = deps.syncDir ? await readSyncRecord(deps.syncDir) : null;
  if (deps.syncDir) for (const x of await findRunaExports(deps.syncDir)) ids.push(`icloud:${path.basename(x.path)}`);
  const described = await Promise.all(ids.map((id) => describeIncoming(deps, id, pc, ledger, entries[id])));
  const incoming = described.filter((i) => !(i.source === "icloud" && !isZip(i.fileName) && sent && i.meta?.sha256 === sent.sha256));

  return {
    pc, ledger, gameRunning,
    outbox: outMeta ? { downloadName: deps.runaFormat.kind === "zip" ? OUTBOX_ZIP : OUTBOX_RXDATA, meta: outMeta } : null,
    handOffWarnings: pc ? handOffWarnings(pc, ledger, gameRunning, syncCopy) : [],
    sync: deps.syncDir ? { dir: deps.syncDir, sent } : null,
    incoming, errors,
  };
}

async function readSyncRecord(syncDir: string): Promise<SyncHandoffRecord | null> {
  try {
    const rec = JSON.parse(await readFile(path.join(syncDir, HANDOFF_JSON), "utf8")) as SyncHandoffRecord;
    return rec?.writtenBy === "PokePal" && typeof rec.sha256 === "string" ? rec : null;
  } catch {
    return null;
  }
}

async function newestFolderSave(deps: CrossplayDeps, pc: SaveMeta): Promise<SaveMeta | null> {
  if (!deps.syncDir) return null;
  const sent = await readSyncRecord(deps.syncDir);
  let best: SaveMeta | null = null;
  const consider = (m: SaveMeta) => { if (!best || compareSaves(m, best).newer === "a") best = m; };
  const own = path.join(deps.syncDir, OUTBOX_RXDATA);
  const names = [...(existsSync(own) ? [own] : []), ...(await findRunaExports(deps.syncDir)).map((x) => x.path)];
  for (const file of new Set(names)) {
    try {
      const meta = isZip(file)
        ? await withSaveFile(deps, file, listSaveEntries(file)[0] ?? null, (f) => withTimeout(deps.readMeta(f), ICLOUD_TIMEOUT_MS, ICLOUD_HINT))
        : await withTimeout(deps.readMeta(file), ICLOUD_TIMEOUT_MS, ICLOUD_HINT);
      if (sent && meta.sha256 === sent.sha256) continue;
      if (compareSaves(pc, meta).newer !== "a" && compareSaves(pc, meta).newer !== "same") consider(meta);
    } catch {
      // unreadable files are reported by getStatus; they can't be proven older, so they don't block here
    }
  }
  return best;
}

export async function handOffToRuna(deps: CrossplayDeps, req: { expectedSha256: string; acceptWarnings?: boolean }) {
  if (!existsSync(deps.saveFile)) throw new ActionError("NOT_FOUND", `Save not found at ${deps.saveFile}`);
  const d = dirs(deps);
  const pc = await deps.readMeta(deps.saveFile);
  if (pc.sha256 !== req.expectedSha256) throw new ActionError("FILE_CHANGED", "The PC save changed since you opened this dialog. Check the status again.");
  const ledger = await readLedger(d.ledger);
  const syncFile = deps.syncDir ? path.join(deps.syncDir, OUTBOX_RXDATA) : null;
  const syncCopy = await newestFolderSave(deps, pc);
  requireAccepted(handOffWarnings(pc, ledger, await deps.isGameRunning(), syncCopy), req.acceptWarnings);

  const now = nowOf(deps);
  const backup = await backupFile(deps.saveFile, deps.backupDir, "pc-at-handoff", pc, now);
  await mkdir(d.outbox, { recursive: true });
  const outFile = path.join(d.outbox, OUTBOX_RXDATA);
  const { sha256 } = await install(deps.saveFile, outFile);
  const outZip = path.join(d.outbox, OUTBOX_ZIP);
  buildRunaZip(outFile, outZip, deps.runaFormat.kind === "zip" ? deps.runaFormat.entryPath : DEFAULT_ZIP_ENTRY);

  let syncCopied = false;
  if (deps.syncDir && syncFile) {
    await mkdir(deps.syncDir, { recursive: true });
    if (existsSync(syncFile)) {
      const prior = await withTimeout(deps.readMeta(syncFile), ICLOUD_TIMEOUT_MS, ICLOUD_HINT);
      if (prior.sha256 !== sha256) await backupFile(syncFile, deps.backupDir, "sync-before-send", prior, now);
    }
    await install(outZip, path.join(deps.syncDir, OUTBOX_ZIP));
    await install(outFile, syncFile);
    const record: SyncHandoffRecord = {
      writtenBy: "PokePal", at: now.toISOString(), trainer: pc.trainerName, playtimeSeconds: pc.playtimeSeconds, badges: pc.badgeCount,
      sha256, files: [OUTBOX_ZIP, OUTBOX_RXDATA],
    };
    const recordFile = path.join(deps.syncDir, HANDOFF_JSON);
    await writeFile(`${recordFile}.pokepal-tmp`, JSON.stringify(record, null, 2));
    await rename(`${recordFile}.pokepal-tmp`, recordFile);
    syncCopied = true;
  }

  await writeLedger(d.ledger, {
    holder: "runa",
    handoff: { at: now.toISOString(), pcSha256: pc.sha256, meta: pc },
    history: [...ledger.history, { at: now.toISOString(), event: "handoff", sha256, playtimeSeconds: pc.playtimeSeconds }],
  });
  return { downloadName: deps.runaFormat.kind === "zip" ? OUTBOX_ZIP : OUTBOX_RXDATA, backup, syncCopied };
}

export async function reclaimOnPc(deps: CrossplayDeps, req: { acceptWarnings?: boolean }) {
  const d = dirs(deps);
  const ledger = await readLedger(d.ledger);
  if (ledger.holder !== "runa" || !ledger.handoff) throw new ActionError("NOT_FOUND", "The save is not handed off, so there is nothing to take back.");
  requireAccepted([{ code: "ALREADY_HANDED_OFF", message: `Runa has held the save since ${ledger.handoff.at}. Taking it back means any progress made in Runa since then stays in Runa only.` }], req.acceptWarnings);
  const pc = existsSync(deps.saveFile) ? await deps.readMeta(deps.saveFile) : null;
  const now = nowOf(deps).toISOString();
  await writeLedger(d.ledger, {
    holder: "pc", handoff: null,
    history: [...ledger.history, { at: now, event: "reclaim", sha256: pc?.sha256 ?? "", playtimeSeconds: pc?.playtimeSeconds ?? 0 }],
  });
}

export async function stageUpload(deps: CrossplayDeps, fileName: string, bytes: Uint8Array): Promise<IncomingSave> {
  const safe = path.basename(fileName).replace(/[^\w.\- ()]/g, "_");
  if (!UPLOAD_PATTERN.test(safe)) throw new ActionError("BAD_UPLOAD", "Upload a Runa export (.zip) or a Game.rxdata file.");
  const d = dirs(deps);
  await mkdir(d.inbox, { recursive: true });
  const stamp = nowOf(deps).toISOString().replace(/[-:]/g, "").replace(/\.(\d+)Z$/, "$1");
  const name = `${stamp}_${safe}`;
  await writeFile(path.join(d.inbox, name), bytes);
  const pc = existsSync(deps.saveFile) ? await deps.readMeta(deps.saveFile) : null;
  const item = await describeIncoming(deps, `upload:${name}`, pc, await readLedger(d.ledger));
  if (item.error && !(item.entries && item.entries.length > 1)) {
    await rm(path.join(d.inbox, name), { force: true });
    throw new ActionError(item.entries ? "BAD_UPLOAD" : "PARSE_FAILED", item.error);
  }
  return item;
}

export async function discardUpload(deps: CrossplayDeps, id: string) {
  const { source, file } = resolveIncoming(deps, id);
  if (source !== "upload") throw new ActionError("NOT_FOUND", "Only uploaded files can be discarded here.");
  await rm(file, { force: true });
}

export async function installOnPc(deps: CrossplayDeps, req: { id: string; entry: string | null; expectedSha256: string; acceptWarnings?: boolean }) {
  const { source, file } = resolveIncoming(deps, req.id);
  if (await deps.isGameRunning()) throw new ActionError("GAME_RUNNING", "Close Pokémon Reborn on the PC first.");
  const d = dirs(deps);
  const result = await withSaveFile(deps, file, req.entry, async (src) => {
    const incoming = await deps.readMeta(src);
    if (incoming.sha256 !== req.expectedSha256) throw new ActionError("FILE_CHANGED", "That save changed since you opened this dialog. Refresh the page.");
    const pc = existsSync(deps.saveFile) ? await deps.readMeta(deps.saveFile) : null;
    const ledger = await readLedger(d.ledger);
    requireAccepted(incomingWarnings(incoming, pc, ledger), req.acceptWarnings);
    const now = nowOf(deps);
    const backup: BackupEntry | null = pc ? await backupFile(deps.saveFile, deps.backupDir, "pc-before-install", pc, now) : null;
    const { sha256 } = await install(src, deps.saveFile);
    await writeLedger(d.ledger, {
      holder: "pc", handoff: null,
      history: [...ledger.history, { at: now.toISOString(), event: "install", sha256, playtimeSeconds: incoming.playtimeSeconds }],
    });
    return { installedSha256: sha256, backup };
  });
  if (source === "upload") await rm(file, { force: true });
  return result;
}

export async function restoreBackup(deps: CrossplayDeps, req: { backupId: string; expectedSha256: string; acceptWarnings?: boolean }) {
  const entry = (await listBackups(deps.backupDir)).find((b) => b.id === req.backupId);
  if (!entry || !existsSync(entry.file)) throw new ActionError("NOT_FOUND", `Backup ${req.backupId} not found.`);
  if (await deps.isGameRunning()) throw new ActionError("GAME_RUNNING", "Close Pokémon Reborn on the PC first.");
  const d = dirs(deps);
  const meta = await deps.readMeta(entry.file);
  if (meta.sha256 !== req.expectedSha256) throw new ActionError("FILE_CHANGED", "That backup file changed on disk. Refresh the list.");
  const pc = existsSync(deps.saveFile) ? await deps.readMeta(deps.saveFile) : null;
  const ledger = await readLedger(d.ledger);
  requireAccepted(restoreWarnings(meta, pc, ledger), req.acceptWarnings);
  const now = nowOf(deps);
  const backup = pc ? await backupFile(deps.saveFile, deps.backupDir, "pc-before-restore", pc, now) : null;
  const { sha256 } = await install(entry.file, deps.saveFile);
  await writeLedger(d.ledger, {
    holder: "pc", handoff: null,
    history: [...ledger.history, { at: now.toISOString(), event: "restore", sha256, playtimeSeconds: meta.playtimeSeconds }],
  });
  return { installedSha256: sha256, backup };
}
