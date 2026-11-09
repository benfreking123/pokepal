export const LAYOUT_STORAGE_KEY = "pokepal.dashboard.layout.v1";
export const MOBILE_QUERY = "(max-width: 768px)";

export const PANELS = [
  { id: "battle", title: "Battle" },
  { id: "type-chart", title: "Type Chart" },
  { id: "prep", title: "Battle Prep" },
  { id: "team", title: "Team / PC" },
  { id: "save-swap", title: "Save Swap" },
  { id: "guides", title: "Guides" },
  { id: "settings", title: "Settings" },
] as const;
export type PanelId = (typeof PANELS)[number]["id"];

export function panelFromHash(hash: string): PanelId | null {
  const h = hash.replace(/^#/, "");
  return PANELS.find((p) => h === p.id || h.startsWith(`${p.id}-`))?.id ?? null;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function loadLayout(storage: StorageLike): unknown | null {
  try {
    const raw = storage.getItem(LAYOUT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveLayout(storage: StorageLike, layout: unknown): void {
  try {
    storage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // storage full or blocked: layout just won't persist
  }
}

export function resetLayout(storage: StorageLike): void {
  try {
    storage.removeItem(LAYOUT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Every panel must exist in a restored layout, otherwise fall back to the default one. */
export function layoutHasAllPanels(layout: unknown): boolean {
  const panels = (layout as { panels?: Record<string, unknown> } | null)?.panels;
  return !!panels && PANELS.every((p) => p.id in panels);
}
