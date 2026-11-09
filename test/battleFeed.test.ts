import { mkdir, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, expect, it } from "vitest";
import { createBattleFeed, registerBattleRoutes, type BattleFeed } from "../server/routes/battle";
import { openSpoilers } from "../server/routes/spoilers";
import type { LiveBattleMessage, TrainerFull } from "../shared/types";

const fixture = (name: string) => path.join(import.meta.dirname, "fixtures", "battle", name);
const gengar = (partyId: number, level: number): TrainerFull => ({
  key: `LEADER_X:X:${partyId}`, trainerType: "LEADER_X", name: "X", label: "Leader X", partyId,
  mons: [{ species: "GENGAR", form: 0, level, moves: ["SHADOWBALL"], ability: "CURSEDBODY", item: "SPELLTAG" }, { species: "MAGNEZONE", form: 0, level: 81, moves: [], ability: null, item: null }],
});
const trainers = { [gengar(0, 80).key]: gengar(0, 80), [gengar(1, 90).key]: gengar(1, 90) };

const feeds: BattleFeed[] = [];
afterEach(async () => { while (feeds.length) await feeds.pop()!.close(); });

async function setup() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pokepal-battle-"));
  const store = await openSpoilers(path.join(dir, "state", "spoilers.json"));
  const file = path.join(dir, "PokePal", "battle_state.json");
  const feed = createBattleFeed({ file, trainers, store });
  feeds.push(feed);
  const messages: LiveBattleMessage[] = [];
  feed.subscribe((m) => messages.push(m));
  const next = async (count: number) => {
    for (let i = 0; i < 100 && messages.length < count; i++) await new Promise((r) => setTimeout(r, 50));
    expect(messages.length).toBeGreaterThanOrEqual(count);
    return messages[count - 1];
  };
  const put = async (text: string) => {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(`${file}.tmp`, text);
    await rename(`${file}.tmp`, file);
  };
  return { dir, store, file, feed, next, put, messages };
}

it("picks up the file, matches the trainer and records the foes seen", async () => {
  const { feed, store, next, put } = await setup();
  await put(await readFile(fixture("synthetic-trainer-single.json"), "utf8"));
  const m = await next(1);
  expect(m).toMatchObject({ battleId: "1731183303-4821", match: { key: "LEADER_X:X:0", exact: true }, foes: [{ species: "GENGAR", level: 80 }] });
  expect(store.state.seen).toEqual({ "LEADER_X:X:0": [0] });
  expect(JSON.stringify(m)).not.toMatch(/SHADOWBALL|CURSEDBODY|SPELLTAG/);
  expect(feed.latest()).toEqual(m);
});

it("leaves out foe levels when Opponent levels is off", async () => {
  const { store, next, put } = await setup();
  store.state = { ...store.state, settings: { ...store.state.settings, opponentLevels: false } };
  await put(await readFile(fixture("synthetic-trainer-single.json"), "utf8"));
  const m = await next(1);
  expect(m).toMatchObject({ foes: [{ species: "GENGAR" }] });
  expect("error" in m ? [] : m.foes.map((f) => "level" in f)).toEqual([false]);
});

it("ignores half-written files and reports an unsupported schema", async () => {
  const { next, put, messages } = await setup();
  await put('{"schema":1,');
  await new Promise((r) => setTimeout(r, 500));
  expect(messages).toEqual([]);
  await put(JSON.stringify({ schema: 2 }));
  expect(await next(1)).toEqual({ error: "Bridge mod version not supported — update PokePal or the mod" });
});

it("serves the latest state over HTTP and stays quiet without a file", async () => {
  const quiet = await openSpoilers(path.join(os.tmpdir(), "pokepal-none", "spoilers.json"));
  const idle = createBattleFeed({ file: null, trainers, store: quiet });
  const app = Fastify();
  registerBattleRoutes(app, idle);
  const none = await app.inject("/api/battle/state");
  expect(none.json()).toBeNull();
  expect(none.headers["cache-control"]).toBe("no-store");

  const { feed, next, put } = await setup();
  const app2 = Fastify();
  registerBattleRoutes(app2, feed);
  await put(await readFile(fixture("synthetic-trainer-double.json"), "utf8"));
  await next(1);
  const res = await app2.inject("/api/battle/state");
  expect(res.json()).toMatchObject({ isDouble: true, match: { key: "LEADER_X:X:0" }, foes: [{ slot: 0 }, { slot: 1 }] });
});

it("streams battle-state events to new and connected clients", async () => {
  const { feed, next, put } = await setup();
  const app = Fastify();
  registerBattleRoutes(app, feed);
  await app.listen({ port: 0, host: "127.0.0.1" });
  try {
    const url = `http://127.0.0.1:${(app.server.address() as { port: number }).port}/api/battle/stream`;
    const ctrl = new AbortController();
    const res = await fetch(url, { signal: ctrl.signal });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const reader = res.body!.getReader();
    let text = "";
    const until = async (re: RegExp) => {
      while (!re.test(text)) {
        const { value, done } = await reader.read();
        if (done) break;
        text += new TextDecoder().decode(value);
      }
    };
    await until(/: connected/);
    await put(await readFile(fixture("synthetic-trainer-single.json"), "utf8"));
    await next(1);
    await until(/event: battle-state\ndata: \{.*\}\n\n/);
    expect(text).toMatch(/event: battle-state\ndata: \{"schema":1/);
    ctrl.abort();
  } finally {
    await app.close();
  }
});

it("sends save-changed on the battle stream so a dashboard needs only one connection", async () => {
  const { feed } = await setup();
  let notify = () => {};
  let unsubscribed = 0;
  const saves = { subscribe: (fn: () => void) => { notify = fn; return () => { unsubscribed++; }; } };
  const app = Fastify();
  registerBattleRoutes(app, feed, undefined, undefined, saves);
  await app.listen({ port: 0, host: "127.0.0.1" });
  try {
    const url = `http://127.0.0.1:${(app.server.address() as { port: number }).port}/api/battle/stream`;
    const ctrl = new AbortController();
    const res = await fetch(url, { signal: ctrl.signal });
    const reader = res.body!.getReader();
    let text = "";
    const until = async (re: RegExp) => { while (!re.test(text)) { const { value, done } = await reader.read(); if (done) break; text += new TextDecoder().decode(value); } };
    await until(/: connected/);
    notify();
    await until(/event: save-changed\ndata: \{\}\n\n/);
    expect(text).toContain("event: save-changed");
    ctrl.abort();
    for (let i = 0; i < 50 && unsubscribed === 0; i++) await new Promise((r) => setTimeout(r, 20));
    expect(unsubscribed).toBe(1);
  } finally {
    await app.close();
  }
});
