import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import chokidar from "chokidar";
import type { FastifyInstance } from "fastify";
import type { SaveSummary } from "../../shared/types";
import type { Config } from "../config";
import type { LoadedData } from "../../shared/types";
import { mapSave } from "../save/mapSave";
import { readSaveFile, SaveParseError } from "../save/readSave";
import { trackedIds } from "../../shared/whatsNext";
import { loadWhatsNext } from "../whatsnext/load";

let cached: { key: string; summary: SaveSummary } | null = null;

export const latestFieldNotes = (): string[] | null => cached?.summary.fieldNotesFound ?? null;

export class SaveUnavailable extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function loadSummary(config: Config, data: LoadedData | Error): Promise<SaveSummary> {
  if (data instanceof Error) throw new SaveUnavailable(data.message, 503);
  if (!config.saveFile || !existsSync(config.saveFile)) throw new SaveUnavailable(`Save not found at ${config.saveFile}`, 404);
  try {
    const st = await stat(config.saveFile);
    const key = `${config.saveFile}|${st.size}|${st.mtimeMs}`;
    if (cached?.key !== key) {
      const tracked = await loadWhatsNext().then(trackedIds, () => ({ variables: [], switches: [], items: [] }));
      cached = { key, summary: mapSave(await readSaveFile(config.saveFile), data.game, tracked) };
    }
    return cached.summary;
  } catch (e) {
    if (e instanceof SaveParseError) throw new SaveUnavailable(e.message, 422);
    throw e;
  }
}

export interface SaveNotifier { subscribe(fn: () => void): () => void }

/** One shared watcher on the save file for every stream, started with the first subscriber and closed after the last. */
export function createSaveNotifier(saveFile: string | null): SaveNotifier {
  const subs = new Set<() => void>();
  let watcher: ReturnType<typeof chokidar.watch> | null = null;
  return {
    subscribe(fn) {
      subs.add(fn);
      if (!watcher && saveFile) {
        const notify = () => subs.forEach((s) => s());
        watcher = chokidar.watch(saveFile, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 1000 } }).on("add", notify).on("change", notify);
      }
      return () => {
        subs.delete(fn);
        if (subs.size === 0 && watcher) { void watcher.close(); watcher = null; }
      };
    },
  };
}

export function registerSaveRoutes(app: FastifyInstance, config: Config, data: LoadedData | Error, notifier: SaveNotifier = createSaveNotifier(config.saveFile)) {
  app.get("/api/save/summary", async (_req, reply) => {
    reply.header("cache-control", "no-store");
    try {
      return await loadSummary(config, data);
    } catch (e) {
      if (e instanceof SaveUnavailable) return reply.code(e.status).send({ error: e.message });
      throw e;
    }
  });

  app.get("/api/save/stream", (req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "access-control-allow-origin": "*" });
    reply.raw.write(": connected\n\n");
    const unsubscribe = notifier.subscribe(() => reply.raw.write("event: save-changed\ndata: {}\n\n"));
    const ping = setInterval(() => reply.raw.write(": ping\n\n"), 25_000);
    req.raw.on("close", () => {
      clearInterval(ping);
      unsubscribe();
    });
  });
}
