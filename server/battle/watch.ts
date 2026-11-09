import { watch, type FSWatcher } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseBattleState, type BattleState } from "./schema";

export const UNSUPPORTED_MESSAGE = "Bridge mod version not supported — update PokePal or the mod";

/** The mod writes the file atomically (temp file, then rename), so a change can be read at once. */
const DEBOUNCE_MS = 5;
/** Safety net when fs.watch misses an event or the folder doesn't exist yet. */
const POLL_MS = 200;
/** A half-written file (the mod always renames a finished one into place, but other tools may not) is read again soon. */
const RETRY_MS = 25;

export function watchBattleState(
  file: string,
  onState: (s: BattleState | { error: string }) => void,
  debug: (msg: string) => void = () => {},
): () => Promise<void> {
  const dir = path.dirname(file);
  const base = path.basename(file);
  let watcher: FSWatcher | null = null;
  let lastSignature = "";
  let closed = false;
  let reading = false;
  let again = false;
  let timer: NodeJS.Timeout | null = null;

  const schedule = (ms: number) => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void read(); }, ms);
  };

  const read = async () => {
    if (closed) return;
    if (reading) { again = true; return; }
    reading = true;
    try {
      const st = await stat(file).catch(() => null);
      if (!st) return;
      const signature = `${st.mtimeMs}:${st.size}:${st.ino}`;
      if (signature === lastSignature) return;
      let text: string;
      try { text = await readFile(file, "utf8"); } catch (e) { debug(`battle state unreadable: ${(e as Error).message}`); return; }
      const r = parseBattleState(text);
      if (r.ok) { lastSignature = signature; onState(r.state); }
      else if (r.reason === "unsupported-schema") { lastSignature = signature; onState({ error: UNSUPPORTED_MESSAGE }); }
      else if (r.reason === "invalid-json") { debug("battle state ignored (invalid-json)"); schedule(RETRY_MS); }
      else { lastSignature = signature; debug(`battle state ignored (${r.reason})`); }
    } finally {
      reading = false;
      if (again) { again = false; schedule(0); }
    }
  };

  const attach = () => {
    if (watcher || closed) return;
    try {
      watcher = watch(dir, (_event, name) => { if (!name || name.toString() === base) schedule(DEBOUNCE_MS); });
      watcher.on("error", () => { watcher?.close(); watcher = null; });
    } catch {
      watcher = null;
    }
  };

  attach();
  const poll = setInterval(() => { attach(); void read(); }, POLL_MS);
  poll.unref();
  void read();
  return async () => {
    closed = true;
    clearInterval(poll);
    if (timer) clearTimeout(timer);
    watcher?.close();
    while (reading) await new Promise((r) => setTimeout(r, 5));
  };
}
