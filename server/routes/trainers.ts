import type { FastifyInstance } from "fastify";
import type { LoadedData } from "../../shared/types";
import { trainerView } from "../spoilers/filter";
import { revealNext, writeSpoilerState } from "../spoilers/state";
import type { SpoilerStore } from "./spoilers";

export function registerTrainerRoutes(app: FastifyInstance, data: LoadedData, store: SpoilerStore) {
  const view = (key: string) => trainerView(data.trainers[key], store.state.settings, store.state.seen[key] ?? []);

  app.get<{ Params: { key: string } }>("/api/trainers/:key", async (req, reply) => {
    reply.header("cache-control", "no-store");
    if (!data.trainers[req.params.key]) return reply.code(404).send({ error: `Unknown trainer ${req.params.key}` });
    return view(req.params.key);
  });

  app.post<{ Params: { key: string } }>("/api/trainers/:key/reveal-next", async (req, reply) => {
    reply.header("cache-control", "no-store");
    const trainer = data.trainers[req.params.key];
    if (!trainer) return reply.code(404).send({ error: `Unknown trainer ${req.params.key}` });
    const next = revealNext(store.state, trainer);
    await writeSpoilerState(store.file, next);
    store.state = next;
    store.error = null;
    return view(req.params.key);
  });
}
