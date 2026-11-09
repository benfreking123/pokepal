# PokePal bridge mod

`PokePalBridge.rb` is a small read-only mod for Pokémon Reborn 19.5. It writes the current battle (the foes on the field, the field effect, your party's HP, the opposing trainer) to a JSON file that PokePal watches, so the Battle tab can follow a fight live and Battle Prep can select the trainer you are facing.

- Read-only: it never changes battle state, the save, or the screen. No key bindings, no windows, no text.
- Writes `battle_state.json` (atomically, via a `.tmp` file and a rename) in `<save dir>\PokePal\`. The save dir is wherever the game keeps `Game.rxdata` (`C:\Users\Ben\Saved Games\Pokemon Reborn`).
- It never writes foe moves, abilities, items, stats or EVs: only what you can already see or check with Battle Inspect.
- Online battles: it writes nothing.
- Needs no gems (it has its own JSON encoder). Works with the game's own Ruby 3.1.

## Install

1. Close the game.
2. Create `<game dir>\patch\Mods\` if it doesn't exist (for example `C:\Users\Ben\Desktop\Reborn-19.5.0\patch\Mods`).
3. Copy `mod\PokePalBridge.rb` into it **as `zz_PokePalBridge.rb`**. The game loads `patch\Mods\*.rb` in name order, so the `zz_` prefix makes it load last and sit on top of any other mod.

```powershell
New-Item -ItemType Directory -Force "C:\Users\Ben\Desktop\Reborn-19.5.0\patch\Mods"
Copy-Item mod\PokePalBridge.rb "C:\Users\Ben\Desktop\Reborn-19.5.0\patch\Mods\zz_PokePalBridge.rb"
```

PokePal reads `<save dir>\PokePal\battle_state.json` automatically (`battleStateFile` in `pokepal.config.json`).

## Uninstall

Delete `zz_PokePalBridge.rb`. Nothing else was changed. The Battle tab goes back to manual mode.

## Switching it off without uninstalling

- Set `ENABLED = false` at the top of the file, or
- create an empty file named `disabled` in `<save dir>\PokePal\` (no editing needed; delete it to switch back on).

## Errors

Every hook runs inside `PokePalBridge.safely`. On the first error it writes `<save dir>\PokePal\bridge_error.log` and stops writing for the rest of the session. It never raises into the game. If the Battle tab's "Last update" is stuck, look for that log.

## Other mods

It adds no alias names, no globals and no methods on core classes, and wraps each battle method by redefining it around the method that is current at load time. That keeps it in the chain with alias-based mods (SWM Modular Modpack, Export Team as .txt, ShowMoveEffectiveness, Modular Debug Mode) loaded before or after it. Loading the file twice does nothing the second time. The compatibility checks against real mods are recorded in `docs/environment-findings.md` once run in game.

## Hooks (Reborn 19.5.0)

`PokeBattle_Battle#pbStartBattle` (writes at start and, when it returns, `ended`), `#pbOnActiveOne` (every send-out and switch-in), `#pbEndOfRoundPhase`. Details and file:line references: `docs/environment-findings.md` → "Battle hooks".

## Test

`npm run test:mod` (any Ruby 3.0 or newer; no game needed). It uses stand-in classes for the game's battle class.

## Support

Mods are unsupported by the Reborn developers. Remove this file before reporting a game bug.

## In-game overlay (`PokePalOverlay.rb`)

A second, separate mod that draws a small battle panel from `overlay.json`. PokePal computes everything (field name, each foe's types and their 4x/2x weaknesses on the current field, and up to three switch picks with a short tag); the mod only draws it. Spoiler switches apply on the server, so anything hidden is simply absent from the file.

### Install

1. Close the game and start PokePal (it writes `<save dir>\PokePal\overlay.json` next to `battle_state.json`, only during a battle).
2. Copy `mod\PokePalOverlay.rb` into `<game dir>\patch\Mods\` **as `zz_PokePalOverlay.rb`**. It sorts after `zz_PokePalBridge.rb`.

```powershell
Copy-Item mod\PokePalOverlay.rb "C:\Users\Ben\Desktop\Reborn-19.5.0\patch\Mods\zz_PokePalOverlay.rb"
```

Uninstall by deleting the file. It works with the SWM TypeBattleIcons mod: it only wraps `PokeBattle_Scene` methods and never touches the data boxes or the scene's `@sprites`.

### Behaviour

- **F6** shows or hides the panel (it starts shown).
- Polls the file about twice a second. Nothing is drawn if the file is missing or more than 5 s old (PokePal closed, or no battle). PokePal rewrites it every 2 s during a battle to keep it fresh.
- Hidden while the fight menu is open and while the Battle Stats / Inspect screen is up. It stays visible on the command menu and during messages. Field Notes and Pulse Dex opened from the fight menu are covered by the fight-menu rule.
- Off in online battles (same `isOnline?` check as the bridge). Safari battles use another scene class, so it never runs there.
- Off if `ENABLED = false` in the file, or an empty `disabled` file exists in `<save dir>\PokePal\` (this also switches the bridge off).
- Every hook runs inside `PokePalOverlay.safely`: on the first error it writes `overlay_error.log` in the PokePal folder, disposes its sprites and stays off until the game restarts. Sprites and bitmaps are disposed in `pbEndBattle`.
- Position is the top right; change `PANEL_TOP`, `PANEL_MARGIN` and `PANEL_WIDTH` at the top of the file if it covers something.

### Hooks (Reborn 19.5.0, verified on Ben's install)

`PokeBattle_Scene#pbFrameUpdate(cw, update_cw = true)` (`Battle_Scene.rb:1890`, polling and F6), `#pbEndBattle(result)` (`:2473`, dispose), and `#pbShowBattleStats` (called at `:2923`, hides the panel; its definition isn't in the copied scripts, so it is wrapped only when present). Methods are wrapped by redefining them around the current one (alias-style chaining, like the bridge), never `prepend`. `PokeBattle_Scene` is also reopened in `Battle_TestEnvironment.rb:1111`; that file is not in the copied scripts. The mod draws in its own viewport (z 100000) with one sprite. It has no map panel (`Scene_Map` is not hooked).

`npm run test:mod` runs it against stand-in RGSS classes.
