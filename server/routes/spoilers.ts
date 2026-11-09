import type { FastifyInstance } from "fastify";
import { SPOILER_SWITCHES } from "../../shared/spoilers";
import { applyUpdate, readSpoilerState, SpoilerUpdateSchema, writeSpoilerState, type SpoilerState } from "../spoilers/state";
import { DEFAULT_SPOILERS } from "../../shared/spoilers";

export interface SpoilerStore { file: string; state: SpoilerState; error: string | null }

export async function openSpoilers(file: string): Promise<SpoilerStore> {
  try {
    return { file, state: await readSpoilerState(file), error: null };
  } catch (e) {
    return { file, state: { settings: DEFAULT_SPOILERS, seen: {}, foundFieldNotes: [] }, error: (e as Error).message };
  }
}

const describe = (store: SpoilerStore) => ({
  settings: store.state.settings,
  foundFieldNotes: store.state.foundFieldNotes,
  seenTrainerCount: Object.keys(store.state.seen).length,
  switches: SPOILER_SWITCHES,
  error: store.error,
});

export function registerSpoilerRoutes(app: FastifyInstance, store: SpoilerStore) {
  app.get("/api/spoilers", async (_req, reply) => reply.header("cache-control", "no-store").send(describe(store)));

  app.put("/api/spoilers", async (req, reply) => {
    const parsed = SpoilerUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const next = applyUpdate(store.state, parsed.data);
    await writeSpoilerState(store.file, next);
    store.state = next;
    store.error = null;
    return reply.header("cache-control", "no-store").send(describe(store));
  });
}
