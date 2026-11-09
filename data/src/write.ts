const sortDeep = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(sortDeep) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep((v as Record<string, unknown>)[k])])) : v;

export const stableStringify = (value: unknown) => JSON.stringify(sortDeep(value), null, 2) + "\n";

export interface Manifest { latest: string; versions: string[] }

const cmpVersion = (a: string, b: string) => {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
};

export function updateManifest(current: Manifest | null, version: string): Manifest {
  const versions = [...new Set([...(current?.versions ?? []), version])].sort(cmpVersion);
  return { latest: versions[versions.length - 1], versions };
}
