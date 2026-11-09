import { describe, expect, it } from "vitest";
import { layoutHasAllPanels, LAYOUT_STORAGE_KEY, loadLayout, panelFromHash, PANELS, resetLayout, saveLayout } from "../web/dock/layout";

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
}

describe("dashboard layout persistence", () => {
  it("round-trips a saved layout and clears it on reset", () => {
    const s = fakeStorage();
    expect(loadLayout(s)).toBeNull();
    const layout = { panels: Object.fromEntries(PANELS.map((p) => [p.id, {}])), grid: 1 };
    saveLayout(s, layout);
    expect(s.m.has(LAYOUT_STORAGE_KEY)).toBe(true);
    expect(loadLayout(s)).toEqual(layout);
    resetLayout(s);
    expect(loadLayout(s)).toBeNull();
  });

  it("ignores corrupt storage and layouts missing panels", () => {
    const s = fakeStorage();
    s.setItem(LAYOUT_STORAGE_KEY, "{not json");
    expect(loadLayout(s)).toBeNull();
    expect(layoutHasAllPanels({ panels: { battle: {} } })).toBe(false);
    expect(layoutHasAllPanels(null)).toBe(false);
  });

  it("maps hashes to panels", () => {
    expect(panelFromHash("#settings-spoilers")).toBe("settings");
    expect(panelFromHash("#prep")).toBe("prep");
    expect(panelFromHash("#nope")).toBeNull();
  });
});
