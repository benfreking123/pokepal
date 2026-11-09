# Writes test/fixtures/saves/synthetic-Game.rxdata in the Reborn 19.5 save layout (one root Hash).
# Run: ruby test/fixtures/saves/make-synthetic.rb test/fixtures/saves/synthetic-Game.rxdata
class PokeBattle_Trainer; attr_accessor :name, :trainertype, :id, :badges, :party, :postgame; end
class PokeBattle_Pokemon; end
class PBMove; end
class PokemonStorage; end
class PokemonBox; end
class Game_Switches; end
class Game_System; end
def obj(klass, h) o = klass.new; h.each { |k, v| o.instance_variable_set("@#{k}", v) }; o end
mv = ->(m) { obj(PBMove, move: m, pp: 10, ppup: 0) }
zard = obj(PokeBattle_Pokemon, species: :CHARIZARD, form: 0, name: "Blunt", level: 50, item: :CHARIZARDITEX, ability: :BLAZE, nature: :TIMID,
  moves: [mv[:WINGATTACK], mv[:FLAMETHROWER], mv[nil], mv[nil]], iv: [31, 0, 31, 30, 31, 29], ev: [4, 0, 0, 252, 0, 252],
  personalID: 3_000_000_000, trainerID: 54321, eggsteps: 0, megaEvo: { CHARIZARDITEX: "Mega X Form" })
amph = obj(PokeBattle_Pokemon, species: :AMPHAROS, form: 0, name: "Ampharos", level: 51, item: nil, ability: :STATIC, nature: :MODEST,
  moves: [mv[:THUNDERBOLT], mv[:HIDDENPOWER]], iv: [31]*6, ev: [0]*6, personalID: 7, trainerID: 54321, eggsteps: 0, hptype: :ICE, shinyflag: true)
egg = obj(PokeBattle_Pokemon, species: :TOGEPI, form: 0, name: "Egg", level: 1, moves: [], iv: [0]*6, ev: [0]*6, personalID: 1, trainerID: 1, eggsteps: 2560)
trainer = obj(PokeBattle_Trainer, name: "Bean", trainertype: :PkMnTRAINER_NB2, id: 54321, badges: [true]*5 + [false]*13, party: [zard, amph], postgame: nil)
box0 = obj(PokemonBox, name: "Box 1", background: 0, pokemon: [nil, egg] + [nil]*28)
storage = obj(PokemonStorage, boxes: [box0] + (1...50).map { |i| obj(PokemonBox, name: "Box #{i + 1}", pokemon: [nil]*30) }, currentBox: 0)
switches = obj(Game_Switches, data: [nil, false, true, false, true])
sys = obj(Game_System, game_version: "19.5.0")
save = { Trainer: trainer, playtime: 3_360_920, system: sys, map_id: 240, switches: switches, variable: nil, position: [10, 6], PokemonStorage: storage }
File.binwrite(ARGV[0], Marshal.dump(save))
