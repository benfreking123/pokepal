# Using this data with an AI assistant

Always attach `AGENTS.md` first.

| Question | Attach |
|---|---|
| Type matchups, with or without a field | `versions/<v>/types.json`, `field-overlays.json`, `fields.json` |
| "What is this boss's team?" (spoilers) | `trainers.json`, `bosses.json`, `trainer-types.json` |
| Species lookup (types, stats, abilities, forms) | `species.json` |
| Move details | `moves.json` |

Example prompts:

1. "Using AGENTS.md, types.json, species.json and field-overlays.json: what types is Gengar, and what multiplier does a Dark move do to it on Glitch Field?" (Ghost/Poison; Dark moves become Normal on Glitch, so 0x.)
2. "What are the base stats and abilities of Alolan Raichu? Use species.json only."
3. "Which of these moves are super effective against Steelix on Underwater? Use types.json, field-overlays.json and fields.json."
