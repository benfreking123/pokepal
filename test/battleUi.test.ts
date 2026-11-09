// @vitest-environment jsdom
import { createElement, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_SPOILERS } from "../shared/spoilers";
import type { BattleHistoryEntry, ClientBundle, LiveBattle } from "../shared/types";
import { DashboardContext, type DashboardData } from "../web/dock/context";
import { HistoryTab } from "../web/tabs/HistoryTab";
import { BattleTab } from "../web/tabs/BattleTab";
import type { BattleStream } from "../web/battleStream";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const bundle = {
  species: {}, moves: {}, abilities: {}, items: {}, types: [], chart: {}, fields: {}, overlays: {}, hiddenFields: [], bosses: [],
  spoilers: DEFAULT_SPOILERS,
  trainerIndex: [
    { key: "A:Ann:0", trainerType: "A", name: "Ann", label: "Ann", partyId: 0 },
    { key: "B:Bob:0", trainerType: "B", name: "Bob", label: "Bob", partyId: 0 },
  ],
} as unknown as ClientBundle;

const idleStream = (over: Partial<BattleStream> = {}): BattleStream => ({ live: null, error: null, reconnecting: false, activeId: null, manualFor: null, setManual: () => {}, ...over });
const liveBattle = (over: Partial<LiveBattle> = {}): LiveBattle => ({
  schema: 1, bridgeVersion: "1.0.0", updatedAt: "2026-11-09T20:15:03Z", battleId: "b1", state: "active", isDouble: false,
  field: { id: "INDOOR", name: "Indoor" }, trainer: { type: "A", name: "Ann" }, foes: [], party: [], match: { key: "A:Ann:0", exact: true }, ...over,
});

let root: Root;
let host: HTMLElement;
const requested: string[] = [];

beforeEach(() => {
  requested.length = 0;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.stubGlobal("EventSource", class { addEventListener() {} close() {} });
  vi.stubGlobal("fetch", async (url: string) => {
    requested.push(url);
    const key = decodeURIComponent(url.split("/api/trainers/")[1] ?? "");
    const ok = url.includes("/api/trainers/");
    return { ok, status: ok ? 200 : 404, json: async () => (ok ? { key, label: key.split(":")[1], partyId: 0, mons: [], partial: true } : { error: "no save" }) };
  });
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

const render = async (node: ReactNode) => { await act(async () => { root.render(node); }); await act(async () => {}); };
const click = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await act(async () => {}); };
const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;

it("clicking a trainer in the Battle panel selects it, marks it pressed and loads its view", async () => {
  await render(createElement(BattleTab, { bundle, stream: idleStream() }));
  expect(button("Bob").getAttribute("aria-pressed")).toBe("false");
  await click(button("Bob"));
  expect(requested).toContain("/api/trainers/B%3ABob%3A0");
  expect(button("Bob").getAttribute("aria-pressed")).toBe("true");
  expect(button("Ann").getAttribute("aria-pressed")).toBe("false");
  expect(host.querySelector(".selected-trainer")?.textContent).toBe("vs Bob");
});

it("a trainer picked during a live battle is not replaced by later bridge updates", async () => {
  const live = liveBattle();
  const stream = (l: LiveBattle) => idleStream({ live: l, activeId: l.battleId, setManual: () => {} });
  await render(createElement(BattleTab, { bundle, stream: stream(live) }));
  expect(button("Pick a trainer")).toBeTruthy();
  const manual = idleStream({ live, activeId: "b1", manualFor: "b1" });
  await click(button("Pick a trainer"));
  await render(createElement(BattleTab, { bundle, stream: manual }));
  await click(button("Bob"));
  await render(createElement(BattleTab, { bundle, stream: { ...manual, live: liveBattle({ field: { id: "WATERSURFACE", name: "Water" }, match: { key: "A:Ann:0", exact: false } }) } }));
  expect(button("Bob").getAttribute("aria-pressed")).toBe("true");
});

it("History rows open the battle's trainer in the Battle panel", async () => {
  const entry: BattleHistoryEntry = { battleId: "b9", startedAt: "2026-11-09T20:15:03Z", updatedAt: "2026-11-09T20:20:03Z", state: "ended", result: "won", kind: "trainer", trainer: { type: "B", name: "Bob" }, trainerKey: "B:Bob:0", field: { id: "INDOOR", name: "Indoor" }, foes: [] };
  vi.stubGlobal("fetch", async () => ({ ok: true, status: 200, json: async () => [entry] }));
  const openBattle = vi.fn();
  const ctx: DashboardData = { bundle, stream: idleStream(), reload: () => {}, focus: null, openBattle };
  await render(createElement(DashboardContext.Provider, { value: ctx }, createElement(HistoryTab, { bundle, stream: idleStream() })));
  const row = button("Bob");
  expect(row.textContent).toContain("Won");
  await click(row);
  expect(openBattle).toHaveBeenCalledWith({ trainerKey: "B:Bob:0", fieldId: "NONE", species: null });
});
