export type Cond = { var: number; gte: number } | { sw: number } | { badges: number };

export interface WNSource { label: string; url: string | null }
export interface WNLegData { where: string; what: string; maps: string[] }
export interface WNStepData {
  id: string; badges: number; title: string; route: WNLegData[];
  gym: { number: number; bossId: string } | null;
  namedBattles: string[]; levelCap: number | null; unlocks: string[]; sources: string[];
}
export type WNKind = "sidequest" | "area" | "unlock" | "battle";
export interface WNOptionalData {
  id: string; kind: WNKind; minBadges: number; lastBadges?: number;
  title: string; where: string; needs: string; hint: string;
  done?: Cond; doneLabel?: string; namedBattles?: string[]; sources: string[];
}
export interface WhatsNextData {
  gameVersion: string;
  sources: Record<string, WNSource>;
  progress: {
    variables: Record<string, { name: string; from: string; note: string }>;
    switches: Record<string, { name: string; from: string; note: string }>;
  };
  mainSteps: WNStepData[];
  optional: WNOptionalData[];
}

/** The parts of a save that drive "What's next"; only ids named by the curated data are copied out of the save. */
export interface SaveProgress {
  badges: number;
  postgame: number;
  mapId: number;
  mapName: string | null;
  playtimeSeconds: number;
  variables: Record<number, number>;
  switches: Record<number, boolean>;
  fieldNotes: boolean;
  fieldNoteCount: number | null;
}

export interface WNLeg { where: string; what: string; state: "done" | "here" | "todo" }
export interface WNStep {
  locked: false; id: string; title: string; legs: WNLeg[]; needs: string;
  /** Present only with the "Trainer locations and story context" spoiler switch on. */
  gym: { number: number | null; bossName: string | null; location: string | null } | null;
  namedBattles: string[] | null; rewards: string[] | null;
  sources: WNSource[];
}
export interface WNLockedStep { locked: true; id: string }
export interface WNItem {
  id: string; kind: WNKind; title: string; where: string; needs: string; hint: string;
  tracked: boolean; done: boolean; doneLabel: string | null; lastChance: boolean;
  namedBattles: string[] | null; sources: WNSource[];
}

export interface WhatsNextView {
  progress: { badges: number; postgame: number; mapName: string | null; playtimeSeconds: number; fieldNotes: boolean };
  storyComplete: boolean;
  showNames: boolean;
  current: WNStep | null;
  completedSteps: { id: string; title: string }[];
  ahead: (WNStep | WNLockedStep)[];
  moreAhead: number;
  optionalNow: WNItem[];
  optionalDone: WNItem[];
  optionalAhead: { revealed: boolean; count: number; items: WNItem[] };
}

export interface WhatsNextOptions {
  showNames: boolean;
  reveal: ReadonlySet<string>;
  bossById: (id: string) => { name: string; location: string | null } | null;
}

export const AHEAD_SHOWN = 3;
export const REVEAL_OPTIONAL = "optional-ahead";
export const revealStep = (id: string) => `step:${id}`;

export function evalCond(c: Cond, p: SaveProgress): boolean {
  if ("var" in c) return (p.variables[c.var] ?? 0) >= c.gte;
  if ("sw" in c) return p.switches[c.sw] === true;
  return p.badges >= c.badges;
}

export const mapMatches = (maps: string[], mapName: string | null) =>
  mapName !== null && maps.some((m) => mapName === m || mapName.startsWith(`${m} `));

/** Highest badge count the story data covers; one step exists per badge count 0..N. */
export function currentStepIndex(steps: WNStepData[], p: SaveProgress): number {
  let idx = 0;
  steps.forEach((s, i) => { if (s.badges <= p.badges) idx = i; });
  return idx;
}

function legs(step: WNStepData, mapName: string | null, isCurrent: boolean): WNLeg[] {
  const here = isCurrent ? step.route.reduce((acc, l, i) => (mapMatches(l.maps, mapName) ? i : acc), -1) : -1;
  return step.route.map((l, i) => ({ where: l.where, what: l.what, state: here < 0 ? "todo" : i < here ? "done" : i === here ? "here" : "todo" }));
}

export function computeWhatsNext(data: WhatsNextData, p: SaveProgress, opt: WhatsNextOptions): WhatsNextView {
  const source = (ids: string[]) => ids.flatMap((id) => (data.sources[id] ? [data.sources[id]] : []));
  const storyComplete = p.postgame > 0;
  const idx = currentStepIndex(data.mainSteps, p);

  const toStep = (s: WNStepData, isCurrent: boolean): WNStep => {
    const boss = s.gym ? opt.bossById(s.gym.bossId) : null;
    return {
      locked: false, id: s.id, title: s.title, legs: legs(s, p.mapName, isCurrent),
      needs: s.levelCap !== null ? `Level cap is ${s.levelCap} right now; a team around that level is comfortable.` : "Keep your team close to the level cap.",
      gym: opt.showNames && s.gym ? { number: s.gym.number, bossName: boss?.name ?? null, location: boss?.location ?? null } : null,
      namedBattles: opt.showNames ? s.namedBattles : null,
      rewards: opt.showNames ? s.unlocks : null,
      sources: source(s.sources),
    };
  };

  const toItem = (o: WNOptionalData): WNItem => ({
    id: o.id, kind: o.kind, title: o.title, where: o.where, needs: o.needs, hint: o.hint,
    tracked: o.done !== undefined, done: o.done ? evalCond(o.done, p) : false, doneLabel: o.doneLabel ?? null,
    lastChance: o.lastBadges !== undefined && o.lastBadges === p.badges,
    namedBattles: opt.showNames ? o.namedBattles ?? null : null,
    sources: source(o.sources),
  });

  const optionalNow: WNItem[] = [];
  const optionalDone: WNItem[] = [];
  const aheadItems: WNOptionalData[] = [];
  for (const o of data.optional) {
    const item = toItem(o);
    if (o.minBadges > p.badges) { aheadItems.push(o); continue; }
    if (item.done) optionalDone.push(item);
    else if (o.lastBadges === undefined || p.badges <= o.lastBadges) optionalNow.push(item);
  }

  const upcoming = data.mainSteps.slice(idx + 1);
  const shown = upcoming.slice(0, AHEAD_SHOWN);
  const optionalRevealed = opt.reveal.has(REVEAL_OPTIONAL);

  return {
    progress: { badges: p.badges, postgame: p.postgame, mapName: p.mapName, playtimeSeconds: p.playtimeSeconds, fieldNotes: p.fieldNotes },
    storyComplete, showNames: opt.showNames,
    current: storyComplete ? null : toStep(data.mainSteps[idx], true),
    completedSteps: data.mainSteps.slice(0, storyComplete ? idx + 1 : idx).map((s) => ({ id: s.id, title: s.title })),
    ahead: storyComplete ? [] : shown.map((s) => (opt.reveal.has(revealStep(s.id)) ? toStep(s, false) : { locked: true as const, id: s.id })),
    moreAhead: storyComplete ? 0 : Math.max(0, upcoming.length - shown.length),
    optionalNow,
    optionalDone,
    optionalAhead: { revealed: optionalRevealed, count: aheadItems.length, items: optionalRevealed ? aheadItems.map(toItem) : [] },
  };
}

export function trackedIds(data: WhatsNextData): { variables: number[]; switches: number[] } {
  const variables = new Set(Object.keys(data.progress.variables).map(Number));
  const switches = new Set(Object.keys(data.progress.switches).map(Number));
  const walk = (c: Cond | undefined) => {
    if (!c) return;
    if ("var" in c) variables.add(c.var);
    else if ("sw" in c) switches.add(c.sw);
  };
  data.optional.forEach((o) => walk(o.done));
  return { variables: [...variables].sort((a, b) => a - b), switches: [...switches].sort((a, b) => a - b) };
}
