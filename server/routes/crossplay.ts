import { createReadStream, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { stat } from "node:fs/promises";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { Config } from "../config";
import type { LoadedData, SaveMeta } from "../../shared/types";
import {
  ActionError, discardUpload, getStatus, handOffToRuna, installOnPc, OUTBOX_RXDATA, OUTBOX_ZIP, reclaimOnPc, restoreBackup, stageUpload,
  type CrossplayDeps,
} from "../crossplay/actions";
import { listBackups } from "../crossplay/files";
import { isGameRunning } from "../crossplay/gameProcess";
import { readSaveMeta } from "../save/mapSave";
import { pcOnly } from "./guard";

const HTTP_STATUS = { NOT_FOUND: 404, GAME_RUNNING: 409, FILE_CHANGED: 409, NEEDS_CONFIRMATION: 409, BAD_UPLOAD: 400, PARSE_FAILED: 422, COPY_FAILED: 500 } as const;
const MAX_UPLOAD = 32 * 1024 * 1024;

export function makeCrossplayDeps(config: Config, data: LoadedData): CrossplayDeps {
  const cache = new Map<string, SaveMeta>();
  return {
    saveFile: config.saveFile!, stateDir: config.stateDir!, backupDir: config.backupDir!, syncDir: config.syncDir,
    tmpDir: os.tmpdir(), runaFormat: config.runaFormat,
    readMeta: async (file) => {
      const st = await stat(file);
      const key = `${file}|${st.size}|${st.mtimeMs}`;
      const hit = cache.get(key);
      if (hit) return hit;
      const meta = await readSaveMeta(file, data.game);
      cache.set(key, meta);
      return meta;
    },
    isGameRunning: () => isGameRunning(config.gameProcessNames, config.gameDir),
  };
}

export function registerCrossplayRoutes(app: FastifyInstance, config: Config, data: LoadedData | Error) {
  const missing = (): string | null => {
    if (data instanceof Error) return data.message;
    for (const f of ["saveFile", "stateDir", "backupDir"] as const) if (!config[f]) return `Set ${f} in Settings`;
    return null;
  };
  const deps = (): CrossplayDeps => makeCrossplayDeps(config, data as LoadedData);

  const guarded = <T>(run: (d: CrossplayDeps) => Promise<T>) => async (reply: FastifyReply) => {
    reply.header("cache-control", "no-store");
    const problem = missing();
    if (problem) return reply.code(data instanceof Error ? 503 : 400).send({ error: problem });
    const d = deps();
    try {
      const result = await run(d);
      return { ...(result as object), status: await getStatus(d) };
    } catch (e) {
      if (e instanceof ActionError) return reply.code(HTTP_STATUS[e.code]).send({ error: e.message, code: e.code, warnings: e.warnings });
      throw e;
    }
  };

  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: MAX_UPLOAD }, (_req, body, done) => done(null, body));

  app.get<{ Querystring: { entries?: string } }>("/api/crossplay/status", async (req, reply) => {
    reply.header("cache-control", "no-store");
    const problem = missing();
    if (problem) return reply.code(data instanceof Error ? 503 : 400).send({ error: problem });
    let entries: Record<string, string> = {};
    try { entries = req.query.entries ? JSON.parse(req.query.entries) : {}; } catch { return reply.code(400).send({ error: "entries must be JSON" }); }
    return getStatus(deps(), entries);
  });

  app.post<{ Body: { expectedSha256: string; acceptWarnings?: boolean } }>("/api/crossplay/handoff", (req, reply) =>
    guarded((d) => handOffToRuna(d, req.body ?? ({} as never)))(reply));

  app.post<{ Body: { acceptWarnings?: boolean } }>("/api/crossplay/reclaim", (req, reply) =>
    guarded((d) => reclaimOnPc(d, req.body ?? {}))(reply));

  app.delete<{ Params: { id: string } }>("/api/crossplay/incoming/:id", (req, reply) =>
    guarded(async (d) => { await discardUpload(d, req.params.id); return {}; })(reply));

  app.post<{ Querystring: { name?: string } }>("/api/crossplay/upload", async (req, reply) => {
    if (!Buffer.isBuffer(req.body)) return reply.code(400).send({ error: "Send the file as application/octet-stream." });
    const bytes = req.body;
    return guarded(async (d) => ({ item: await stageUpload(d, req.query.name ?? "upload.bin", bytes) }))(reply);
  });

  app.get("/api/crossplay/outbox", async (_req, reply) => {
    const problem = missing();
    if (problem) return reply.code(400).send({ error: problem });
    const name = config.runaFormat.kind === "zip" ? OUTBOX_ZIP : OUTBOX_RXDATA;
    const file = path.join(config.stateDir!, "outbox", name);
    if (!existsSync(file)) return reply.code(404).send({ error: "Nothing has been handed off yet." });
    reply.header("cache-control", "no-store");
    reply.header("content-disposition", `attachment; filename="${name}"`);
    return reply.type(name.endsWith(".zip") ? "application/zip" : "application/octet-stream").send(createReadStream(file));
  });

  app.get("/api/crossplay/backups", async (_req, reply) => {
    reply.header("cache-control", "no-store");
    const problem = missing();
    if (problem) return reply.code(400).send({ error: problem });
    return listBackups(config.backupDir!);
  });

  app.post<{ Body: { id: string; entry: string | null; expectedSha256: string; acceptWarnings?: boolean } }>(
    "/api/crossplay/install", { preHandler: pcOnly }, (req, reply) => guarded((d) => installOnPc(d, req.body ?? ({} as never)))(reply));

  app.post<{ Body: { backupId: string; expectedSha256: string; acceptWarnings?: boolean } }>(
    "/api/crossplay/restore", { preHandler: pcOnly }, (req, reply) => guarded((d) => restoreBackup(d, req.body ?? ({} as never)))(reply));
}
