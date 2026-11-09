import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import chokidar from "chokidar";
import type { FastifyInstance } from "fastify";
import type { SaveSummary } from "../../shared/types";
import type { Config } from "../config";
import type { LoadedData } from "../../shared/types";
import { mapSave } from "../save/mapSave";
import { readSaveFile, SaveParseError } from "../save/readSave";

let cached: { key: string; summary: SaveSummary } | null = null;

export const latestFieldNotes = (): string[] | null => cached?.summary.fieldNotesFound ?? null;

export function registerSaveRoutes(app: FastifyInstance, config: Config, data: LoadedData | Error) {
  const notFound = () => `Save not found at ${config.saveFile}`;

  app.get("/api/save/summary", async (_req, reply) => {
    reply.header("cache-control", "no-store");
    if (data instanceof Error) return reply.code(503).send({ error: data.message });
    if (!config.saveFile || !existsSync(config.saveFile)) return reply.code(404).send({ error: notFound() });
    try {
      const st = await stat(config.saveFile);
      const key = `${config.saveFile}|${st.size}|${st.mtimeMs}`;
      if (cached?.key !== key) cached = { key, summary: mapSave(await readSaveFile(config.saveFile), data.game) };
      return cached.summary;
    } catch (e) {
      if (e instanceof SaveParseError) return reply.code(422).send({ error: e.message });
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
