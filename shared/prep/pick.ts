import type { BaseChart, FieldOverlay } from "../types";
import { scoreMatchup, type MatchupDetail, type PrepCandidate, type PrepFoe } from "./score";

export interface PickOptions { locked: string[]; excluded: string[]; size?: number }
export interface PickResult {
  team: string[];
  reasons: Record<string, { foeIndex: number; detail: MatchupDetail }[]>;
  alternates: { uid: string; value: number }[][];
}

const EPS = 1e-9;

export function buildMatrix(chart: BaseChart, overlay: FieldOverlay, candidates: PrepCandidate[], foes: PrepFoe[]) {
  return new Map(candidates.map((c) => [c.uid, foes.map((f) => scoreMatchup(chart, overlay, c, f))]));
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > EPS) return a[i] - b[i];
  return 0;
}

export function pickTeam(candidates: PrepCandidate[], foeCount: number, matrix: Map<string, MatchupDetail[]>, opts: PickOptions): PickResult {
  const size = opts.size ?? 6;
  const excluded = new Set(opts.excluded);
  const byUid = new Map(candidates.map((c) => [c.uid, c]));
  const team = opts.locked.filter((u) => byUid.has(u) && !excluded.has(u)).slice(0, size);
  const pool = candidates.filter((c) => !excluded.has(c.uid) && !team.includes(c.uid));
  const val = (uid: string, f: number) => matrix.get(uid)![f].value;
  const coverage = (uids: string[]) => Array.from({ length: foeCount }, (_, f) => Math.max(...uids.map((u) => val(u, f)))).reduce((a, b) => a + b, 0);
  const avg = (uid: string) => matrix.get(uid)!.reduce((s, x) => s + x.value, 0) / Math.max(1, foeCount);

  while (team.length < size && pool.length > 0) {
    let best = pool[0];
    let bestKey = [coverage([...team, best.uid]), avg(best.uid), best.level, -best.order];
    for (const c of pool.slice(1)) {
      const key = [coverage([...team, c.uid]), avg(c.uid), c.level, -c.order];
      if (compareKeys(key, bestKey) > 0) { best = c; bestKey = key; }
    }
    team.push(best.uid);
    pool.splice(pool.indexOf(best), 1);
  }

  const reasons: PickResult["reasons"] = Object.fromEntries(team.map((u) => [u, []]));
  for (let f = 0; f < foeCount && team.length > 0; f++) {
    const top = team.reduce((a, b) => (val(b, f) > val(a, f) + EPS ? b : a));
    reasons[top].push({ foeIndex: f, detail: matrix.get(top)![f] });
  }
  const alternates = Array.from({ length: foeCount }, (_, f) =>
    candidates.filter((c) => !team.includes(c.uid) && !excluded.has(c.uid)).map((c) => ({ uid: c.uid, value: val(c.uid, f) })).sort((a, b) => b.value - a.value).slice(0, 5),
  );
  return { team, reasons, alternates };
}
