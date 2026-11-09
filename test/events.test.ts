// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { onSaveChanged, subscribe } from "../web/events";

class FakeSource {
  static all: FakeSource[] = [];
  static OPEN = 1;
  readyState = 1;
  closed = false;
  private l = new Map<string, ((e: unknown) => void)[]>();
  constructor(public url: string) { FakeSource.all.push(this); }
  addEventListener(n: string, f: (e: unknown) => void) { this.l.set(n, [...(this.l.get(n) ?? []), f]); }
  removeEventListener(n: string, f: (e: unknown) => void) { this.l.set(n, (this.l.get(n) ?? []).filter((x) => x !== f)); }
  close() { this.closed = true; }
  emit(n: string, data: string) { this.l.get(n)?.forEach((f) => f({ data })); }
}

beforeEach(() => { FakeSource.all = []; vi.stubGlobal("EventSource", FakeSource); });
afterEach(() => vi.unstubAllGlobals());

it("shares one connection between every panel and closes it after the last one leaves", () => {
  const battle = vi.fn();
  const saveA = vi.fn();
  const saveB = vi.fn();
  const offs = [subscribe("battle-state", battle), onSaveChanged(saveA), onSaveChanged(saveB)];
  expect(FakeSource.all).toHaveLength(1);
  expect(FakeSource.all[0].url).toBe("/api/battle/stream");
  FakeSource.all[0].emit("save-changed", "{}");
  FakeSource.all[0].emit("battle-state", '{"a":1}');
  expect(saveA).toHaveBeenCalledTimes(1);
  expect(saveB).toHaveBeenCalledTimes(1);
  expect(battle).toHaveBeenCalledWith('{"a":1}');
  offs[1]();
  FakeSource.all[0].emit("save-changed", "{}");
  expect(saveA).toHaveBeenCalledTimes(1);
  expect(saveB).toHaveBeenCalledTimes(2);
  offs[0]();
  expect(FakeSource.all[0].closed).toBe(false);
  offs[2]();
  expect(FakeSource.all[0].closed).toBe(true);
  onSaveChanged(() => {})();
  expect(FakeSource.all).toHaveLength(2);
});
