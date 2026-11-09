import { SPOILER_SWITCHES } from "../../shared/spoilers";
import type { SpoilerSettings } from "../../shared/types";

const SHORT: Record<keyof SpoilerSettings, string> = {
  opponentMoves: "moves",
  opponentAbilities: "abilities",
  opponentItems: "items",
  opponentFullTeam: "full teams",
  opponentLevels: "levels",
  trainerContext: "trainer context",
  fieldDetails: "field details",
};

export function SpoilerChip({ spoilers }: { spoilers: SpoilerSettings }) {
  const on = SPOILER_SWITCHES.filter((s) => spoilers[s.key]).map((s) => SHORT[s.key]);
  return (
    <a className="chip" href="#settings-spoilers">
      {on.length ? `Spoilers on: ${on.join(", ")}` : "Spoilers: none"}
    </a>
  );
}
