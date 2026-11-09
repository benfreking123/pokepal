import { existsSync } from "node:fs";
import os from "node:os";
import type { FastifyInstance } from "fastify";
import { ConfigSchema, saveCandidates, saveConfig, type Config } from "../config";
import { pcOnly } from "./guard";

const PATH_FIELDS = ["gameDir", "saveFile", "syncDir", "stateDir", "backupDir", "battleStateFile"] as const;

function lanUrls(port: number): string[] {
  return Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => `http://${i!.address}:${port}`);
}

export function registerConfigRoutes(app: FastifyInstance, config: Config, env: NodeJS.ProcessEnv = process.env) {
  app.get("/api/config", async (_req, reply) => {
    reply.header("cache-control", "no-store");
    return {
      config,
      exists: Object.fromEntries(PATH_FIELDS.map((k) => [k, config[k] ? existsSync(config[k]!) : false])),
      saveCandidates: saveCandidates(env, config.gameDir).map((p) => ({ path: p, exists: existsSync(p) })),
      lanUrls: lanUrls(config.port),
    };
  });

  app.put("/api/config", { preHandler: pcOnly }, async (req, reply) => {
    const parsed = ConfigSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    await saveConfig(parsed.data);
    return { restartRequired: true };
  });
}
