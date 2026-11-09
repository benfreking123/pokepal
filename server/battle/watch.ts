import chokidar from "chokidar";
import { readFile } from "node:fs/promises";
import { parseBattleState, type BattleState } from "./schema";

export const UNSUPPORTED_MESSAGE = "Bridge mod version not supported — update PokePal or the mod";

export function watchBattleState(
  file: string,
  onState: (s: BattleState | { error: string }) => void,
  debug: (msg: string) => void = () => {},
): () => Promise<void> {
  const watcher = chokidar.watch(file, { ignoreInitial: false, awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 } });
  const read = async () => {
    let text: string;
    try { text = await readFile(file, "utf8"); } catch (e) { debug(`battle state unreadable: ${(e as Error).message}`); return; }
    const r = parseBattleState(text);
    if (r.ok) onState(r.state);
    else if (r.reason === "unsupported-schema") onState({ error: UNSUPPORTED_MESSAGE });
    else debug(`battle state ignored (${r.reason})`);
  };
  watcher.on("add", read).on("change", read);
  return () => watcher.close();
}
