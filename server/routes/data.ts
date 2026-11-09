import type { FastifyInstance } from "fastify";
import type { LoadedData } from "../../shared/types";
import { buildBundle } from "../spoilers/filter";
import type { SpoilerStore } from "./spoilers";

export function registerDataRoutes(app: FastifyInstance, data: LoadedData | Error, store: SpoilerStore, fieldNotesFromSave: () => string[] | null) {
  app.get("/api/data/bundle", async (_req, reply) => {
    reply.header("cache-control", "no-store");
    if (data instanceof Error) return reply.code(503).send({ error: data.message });
    return buildBundle(data, store.state, fieldNotesFromSave());
  });
}
