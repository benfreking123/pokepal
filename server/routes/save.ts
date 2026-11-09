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
      const tracked = await loadWhatsNext().then(trackedIds, () => ({ variables: [], switches: [] }));
      cached = { key, summary: mapSave(await readSaveFile(config.saveFile), data.game, tracked) };
    }
    return cached.summary;
  } catch (e) {
    if (e instanceof SaveParseError) throw new SaveUnavailable(e.message, 422);
    throw e;
  }
}

export function registerSaveRoutes(app: FastifyInstance, config: Config, data: LoadedData | Error) {
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
    const watcher = config.saveFile
      ? chokidar.watch(config.saveFile, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 1000 } })
      : null;
    const notify = () => reply.raw.write("event: save-changed\ndata: {}\n\n");
    watcher?.on("add", notify).on("change", notify);
    const ping = setInterval(() => reply.raw.write(": ping\n\n"), 25_000);
    req.raw.on("close", () => {
      clearInterval(ping);
      void watcher?.close();
    });
  });
}
