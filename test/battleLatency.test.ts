import { mkdir, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { createOverlayWriter } from "../server/overlay/write";
import { createBattleFeed, type BattleFeed } from "../server/routes/battle";
import { openSpoilers } from "../server/routes/spoilers";
import { DEFAULT_SPOILERS } from "../shared/spoilers";
import type { GameData, LiveBattleMessage } from "../shared/types";

const feeds: BattleFeed[] = [];
afterEach(async () => { while (feeds.length) await feeds.pop()!.close(); });

const state = (n: number) => JSON.stringify({
  schema: 1, bridgeVersion: "1.0.0", updatedAt: "", battleId: `b${n}`, state: "active", isDouble: false, field: { id: "INDOOR", name: "INDOOR" }, trainer: null,
  foes: [{ slot: 0, name: `G${n}`, species: "GENGAR", form: 0, formName: null, level: 80, types: ["GHOST"], hpPercent: 100 - n, fainted: false }], party: [],
});
const data = { types: [{ id: "GHOST", name: "Ghost" }], chart: { GHOST: { GHOST: 2 } }, species: {}, fields: {}, overlays: {} } as unknown as GameData;

it("shows a bridge write in the feed and in overlay.json within 100 ms (median), as the bridge writes it", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pokepal-latency-"));
  const store = await openSpoilers(path.join(dir, "state", "spoilers.json"));
  const file = path.join(dir, "PokePal", "battle_state.json");
  const overlayFile = path.join(dir, "PokePal", "overlay.json");
  await mkdir(path.dirname(file), { recursive: true });
  const feed = createBattleFeed({ file, trainers: {}, store });
  feeds.push(feed);
  const writer = createOverlayWriter({ file: overlayFile, data, latest: feed.latest, settings: () => ({ settings: DEFAULT_SPOILERS, found: new Set() }), refreshMs: 60_000 });
  feed.subscribe(() => void writer.refresh());
  const seen: { id: string; at: number }[] = [];
  feed.subscribe((m: LiveBattleMessage) => { if (!("error" in m)) seen.push({ id: m.battleId, at: performance.now() }); });
  await new Promise((r) => setTimeout(r, 200));

  const feedMs: number[] = [];
  const overlayMs: number[] = [];
  for (let n = 1; n <= 12; n++) {
    const t0 = performance.now();
    await writeFile(`${file}.tmp`, state(n));
    await rename(`${file}.tmp`, file);
    let fed: number | null = null;
    let wrote: number | null = null;
    while ((fed === null || wrote === null) && performance.now() - t0 < 2000) {
      if (fed === null) fed = seen.find((x) => x.id === `b${n}`)?.at ?? null;
      if (wrote === null && (await readFile(overlayFile, "utf8").catch(() => "")).includes(`"name":"G${n}"`)) wrote = performance.now();
      await new Promise((r) => setTimeout(r, 2));
    }
    feedMs.push((fed ?? t0 + 2000) - t0);
    overlayMs.push((wrote ?? t0 + 2000) - t0);
    await new Promise((r) => setTimeout(r, 100));
  }
  await writer.close();
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  console.log(`latency write->feed median ${median(feedMs).toFixed(0)} ms (max ${Math.max(...feedMs).toFixed(0)}), write->overlay.json median ${median(overlayMs).toFixed(0)} ms (max ${Math.max(...overlayMs).toFixed(0)})`);
  expect(median(feedMs)).toBeLessThan(100);
  expect(median(overlayMs)).toBeLessThan(100);
}, 30_000);

