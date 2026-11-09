# Environment findings

## Boss spot check

Checked 9 Nov 2026 from a cloud agent (no game install needed): `trainers.json` (19.5.0) against the set data that https://reborn.rebornversecalc.com serves in `js/data/sets/gen9.js`. Compared species, form, level, held item, ability and moves for every Pokémon.

| Boss | trainers.json key | rebornversecalc set | Result |
|---|---|---|---|
| Julia (early gym) | `JULIA:Julia:0` | "Gym Julia (Electric)" | All 6 match |
| Florinia (second gym) | `FLORINIA:Florinia:0` | "Gym Florinia (Desert)" | All 6 match |
| Sirius, Yureyu HQ | `Sirius:Sirius:0` | "Yureyu Sirius (Short Circuit) Doubles" | All 6 match |
| Sirius, Belrose Manse | `Sirius:Sirius:1` | "Belrose Sirius (None)" | All 6 match |
| Sirius, Victory Road | `Sirius:Sirius:2` | "VR Sirius (Dragon's Den) Doubles" | All 6 match |

The calc's "Fiore Florinia" (Lv 68-71) also matches `FLORINIA:Florinia:1`.

One difference, not in the data: rebornversecalc labels the Yureyu HQ Sirius fight as Doubles, while the wiki Battle Guide says single. `bosses.json` follows the calc (`doubles: true`) and notes the disagreement.

Not covered: the mid-game gym (Julia/Florinia are early, Sirius spans mid and late); the other 18 gym leaders were not compared.
