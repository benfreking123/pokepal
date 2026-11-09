import type { FastifyInstance } from "fastify";
import type { LiveBattleMessage, TrainerFull } from "../../shared/types";
import { enrichBattle, type BattleMatch } from "../battle/enrich";
import type { BattleState } from "../battle/schema";
import { historyView, type BattleHistory } from "../battle/history";
import { watchBattleState } from "../battle/watch";
import { liveBattleView } from "../spoilers/filter";
import { writeSpoilerState } from "../spoilers/state";
import type { SpoilerStore } from "./spoilers";

export interface BattleFeed {
  latest(): LiveBattleMessage | null;
  subscribe(fn: (m: LiveBattleMessage) => void): () => void;
  close(): Promise<void>;
}

export function createBattleFeed(opts: {
  file: string | null;
  trainers: Record<string, TrainerFull>;
  store: SpoilerStore;
  history?: BattleHistory;
  log?: (msg: string) => void;
}): BattleFeed {
  const subscribers = new Set<(m: LiveBattleMessage) => void>();
  let raw: { state: BattleState; match: BattleMatch | null } | { error: string } | null = null;

  const view = (): LiveBattleMessage | null => {
    if (!raw) return null;
    return "error" in raw ? raw : liveBattleView(raw.state, raw.match, opts.store.state.settings);
  };
  const publish = () => {
    const m = view();
    if (m) for (const fn of subscribers) fn(m);
  };

  const onState = (s: BattleState | { error: string }) => {
    if ("error" in s) {
      raw = s;
      return publish();
    }
    const { match, spoilers } = enrichBattle(s, opts.trainers, opts.store.state);
    raw = { state: s, match };
    opts.history?.record(s, match?.key ?? null);
    if (spoilers !== opts.store.state) {
      // Replace the in-memory state before the write so a concurrent settings update builds on it.
      opts.store.state = spoilers;
      writeSpoilerState(opts.store.file, spoilers).then(
        () => { opts.store.error = null; },
        (e: Error) => opts.log?.(`could not save seen trainer Pokémon: ${e.message}`),
      );
    }
    publish();
  };

  const stop = opts.file ? watchBattleState(opts.file, onState, opts.log) : async () => {};
  return {
    latest: () => view(),
    subscribe(fn) { subscribers.add(fn); return () => { subscribers.delete(fn); }; },
    close: stop,
  };
}

export function registerBattleRoutes(app: FastifyInstance, feed: BattleFeed, history?: BattleHistory, store?: SpoilerStore) {
  app.get("/api/battle/history", async (_req, reply) => {
    reply.header("cache-control", "no-store");
    return historyView(history?.entries() ?? [], store?.state.settings.opponentLevels ?? true);
  });

  app.get("/api/battle/state", async (_req, reply) => {
    reply.header("cache-control", "no-store");
    const m = feed.latest();
    return m && !("error" in m) ? m : null;
  });

  app.get("/api/battle/stream", (req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "access-control-allow-origin": "*" });
    const send = (m: LiveBattleMessage) => reply.raw.write(`event: battle-state\ndata: ${JSON.stringify(m)}\n\n`);
    reply.raw.write(": connected\n\n");
    const current = feed.latest();
    if (current) send(current);
    const unsubscribe = feed.subscribe(send);
    const ping = setInterval(() => reply.raw.write(": ping\n\n"), 25_000);
    req.raw.on("close", () => {
      clearInterval(ping);
      unsubscribe();
    });
  });
}
