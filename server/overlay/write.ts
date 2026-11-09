import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GameData, LiveBattleMessage } from "../../shared/types";
import type { SpoilerSettings } from "../../shared/types";
import { buildOverlay } from "./build";

/** The game mod ignores overlay.json older than 5 s, so an active battle's file is rewritten well inside that. */
export const REFRESH_MS = 2000;

export const overlayFile = (battleStateFile: string) => path.join(path.dirname(battleStateFile), "overlay.json");

export async function writeAtomic(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, text);
  try {
    await rename(tmp, file);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EPERM" && (e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    await rm(file, { force: true });
    await rename(tmp, file);
  }
}

export interface OverlayWriter { refresh(): Promise<void>; close(): Promise<void> }

export function createOverlayWriter(opts: {
  file: string;
  data: GameData;
  latest: () => LiveBattleMessage | null;
  settings: () => { settings: SpoilerSettings; found: ReadonlySet<string> };
  refreshMs?: number;
  log?: (msg: string) => void;
}): OverlayWriter {
  let chain: Promise<void> = Promise.resolve();
  let closed = false;
  const run = async () => {
    if (closed) return;
    const t0 = performance.now();
    const live = opts.latest();
    const { settings, found } = opts.settings();
    const overlay = live && !("error" in live) ? buildOverlay(live, opts.data, settings, found) : null;
    if (overlay) {
      await writeAtomic(opts.file, JSON.stringify(overlay));
      opts.log?.(`overlay.json written in ${(performance.now() - t0).toFixed(1)} ms`);
    }
    else await rm(opts.file, { force: true });
  };
  const refresh = () => (chain = chain.then(run).catch((e: Error) => opts.log?.(`overlay not written: ${e.message}`)));
  const timer = setInterval(() => void refresh(), opts.refreshMs ?? REFRESH_MS);
  timer.unref();
  return {
    refresh,
    async close() {
      clearInterval(timer);
      await chain;
      closed = true;
      await rm(opts.file, { force: true }).catch(() => {});
    },
  };
}
