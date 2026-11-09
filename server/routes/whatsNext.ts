import type { FastifyInstance } from "fastify";
import type { LoadedData } from "../../shared/types";
import { computeWhatsNext } from "../../shared/whatsNext";
import type { Config } from "../config";
import { loadWhatsNext } from "../whatsnext/load";
import { loadSummary, SaveUnavailable } from "./save";
import type { SpoilerStore } from "./spoilers";

export function registerWhatsNextRoutes(app: FastifyInstance, config: Config, data: LoadedData | Error, store: SpoilerStore) {
  app.get<{ Querystring: { reveal?: string } }>("/api/whats-next", async (req, reply) => {
    reply.header("cache-control", "no-store");
    try {
      const [summary, curated] = await Promise.all([loadSummary(config, data), loadWhatsNext()]);
      const bosses = data instanceof Error ? [] : data.bosses;
      const reveal = new Set((req.query.reveal ?? "").split(",").map((x) => x.trim()).filter(Boolean));
      return computeWhatsNext(curated, summary.progress, {
        showNames: store.state.settings.trainerContext,
        reveal,
        bossById: (id) => { const b = bosses.find((x) => x.id === id); return b ? { name: b.name, location: b.location ?? null } : null; },
      });
    } catch (e) {
      if (e instanceof SaveUnavailable) return reply.code(e.status).send({ error: e.message });
      return reply.code(500).send({ error: (e as Error).message });
    }
  });
}
