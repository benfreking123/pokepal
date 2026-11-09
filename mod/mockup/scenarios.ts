// Builds overlay.json for the mockup scenarios with the real server code and the real extracted game data.
// Run: npx tsx mod/mockup/scenarios.ts <out dir>
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildOverlay } from "../../server/overlay/build";
import { loadGameData } from "../../server/data/loadData";
import { DEFAULT_SPOILERS } from "../../shared/spoilers";
import type { LiveBattle } from "../../shared/types";

const out = process.argv[2] ?? "/tmp/pokepal-mockup";
const { game } = await loadGameData(path.join(import.meta.dirname, "../../data/versions"), null);
const mon = (species: string, nickname: string, level: number, hpPercent: number, moves: string[], speed: number, active = false) => ({ species, form: 0, nickname, level, hpPercent, fainted: false, active, moves, speed });
const base = (over: Partial<LiveBattle>): LiveBattle => ({
  schema: 1, bridgeVersion: "1.0.0", updatedAt: "", battleId: "m", state: "active", isDouble: false, field: { id: "GRASSY", name: "GRASSY" }, trainer: null, match: null,
  foes: [], party: [], ...over,
});

const scenarios: Record<string, LiveBattle> = {
  // Ben's screenshot: "Prodigy Noel is about to send in Porygon-Z."
  "porygonz-prompt": base({
    incoming: { slot: 1, species: "PORYGONZ", form: 0, level: 62, types: ["NORMAL"] },
    party: [
      mon("TALONFLAME", "RazorBurn", 55, 100, ["FLAREBLITZ", "AIRSLASH", "ROOST", "UTURN"], 215, true),
      mon("MACHAMP", "Blunt", 55, 83, ["CLOSECOMBAT", "KNOCKOFF", "STONEEDGE", "BULLETPUNCH"], 90),
      mon("KLINKLANG", "Clanker", 54, 100, ["GEARGRIND", "WILDCHARGE", "SHIFTGEAR", "ROCKSLIDE"], 150),
      mon("HITMONLEE", "Trip", 53, 100, ["HIJUMPKICK", "STONEEDGE", "BLAZEKICK", "MACHPUNCH"], 160),
      mon("LINOONE", "ZigZag", 52, 31, ["BODYSLAM", "SHADOWCLAW", "WORKUP", "SEEDBOMB"], 180),
    ],
  }),
  // The case from the request: Bewear is next; RazorBurn's Flying moves hit it twice as hard.
  "bewear-prompt": base({
    field: { id: "INDOOR", name: "INDOOR" },
    incoming: { slot: 1, species: "BEWEAR", form: 0, level: 60, types: ["NORMAL", "FIGHTING"] },
    party: [
      mon("TALONFLAME", "RazorBurn", 55, 100, ["FLAREBLITZ", "AIRSLASH", "ROOST", "UTURN"], 215),
      mon("ALTARIA", "Blunt", 55, 90, ["DRAGONPULSE", "ROOST", "EARTHQUAKE", "DRAGONDANCE"], 150),
      mon("REUNICLUS", "Trip", 54, 100, ["PSYCHIC", "SHADOWBALL", "CALMMIND", "RECOVER"], 90),
      mon("ZIGZAGOON", "ZigZag", 52, 100, ["BODYSLAM", "SHADOWCLAW", "WORKUP", "SEEDBOMB"], 190, true),
    ],
  }),
  // The normal (non-incoming) panel: Bewear is out.
  "bewear-field": base({
    field: { id: "INDOOR", name: "INDOOR" },
    foes: [{ slot: 0, name: "Bewear", species: "BEWEAR", form: 0, formName: null, types: ["NORMAL", "FIGHTING"], hpPercent: 100, fainted: false, level: 60 }],
    party: [
      mon("ZIGZAGOON", "ZigZag", 52, 100, ["BODYSLAM", "SHADOWCLAW", "WORKUP", "SEEDBOMB"], 190, true),
      mon("TALONFLAME", "RazorBurn", 55, 100, ["FLAREBLITZ", "AIRSLASH", "ROOST", "UTURN"], 215),
      mon("ALTARIA", "Blunt", 55, 90, ["DRAGONPULSE", "ROOST", "EARTHQUAKE", "DRAGONDANCE"], 150),
      mon("REUNICLUS", "Trip", 54, 100, ["PSYCHIC", "SHADOWBALL", "CALMMIND", "RECOVER"], 90),
    ],
  }),
};

await mkdir(out, { recursive: true });
for (const [name, live] of Object.entries(scenarios)) {
  const o = buildOverlay(live, game, DEFAULT_SPOILERS, new Set(["GRASSY"]));
  await writeFile(path.join(out, `${name}.json`), JSON.stringify(o, null, 2));
  console.log(name, JSON.stringify(o?.picks));
}
