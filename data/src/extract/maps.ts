export function extractMaps(mapInfos: unknown): Record<string, string> {
  if (!mapInfos || typeof mapInfos !== "object") throw new Error("maps: expected a hash of MapInfo objects");
  const out: Record<string, string> = {};
  for (const [id, info] of Object.entries(mapInfos as Record<string, Record<string, unknown>>)) {
    const name = info?.["@name"];
    if (typeof name === "string") out[id] = name;
  }
  return out;
}
