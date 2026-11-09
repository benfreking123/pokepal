# Stand-in RGSS classes shared by the overlay mod tests.
require 'tmpdir'
require 'json'
require 'fileutils'

MOD = File.expand_path('../PokePalOverlay.rb', __dir__)
DIR = Dir.mktmpdir('pokepal-overlay')
PP_DIR = File.join(DIR, 'PokePal')
FileUtils.mkdir_p(PP_DIR)
at_exit { FileUtils.rm_rf(DIR) }

module RTP; def self.getSaveFileName(n) = File.join(DIR, n); end
module Graphics; def self.width = 512; def self.height = 384; end
module Input
  F6 = 1
  @pressed = false
  def self.press! = (@pressed = true)
  def self.trigger?(k) = (k == F6 && @pressed ? (@pressed = false; true) : false)
end
class Color; def initialize(*a); end; end
class Font; attr_accessor :size, :color; end
class Bitmap
  LIVE = []
  attr_reader :font
  def initialize(w, h) = (@font = Font.new; @disposed = false; LIVE << self)
  def fill_rect(*a); end
  def draw_text(*a); end
  def dispose = (@disposed = true; LIVE.delete(self))
  def disposed? = @disposed
end
class Viewport; attr_accessor :z; def initialize(*a) = (@d = false); def dispose = (@d = true); def disposed? = @d; end
class Sprite
  LIVE = []
  attr_accessor :x, :y, :visible, :bitmap
  def initialize(vp) = (@d = false; LIVE << self)
  def dispose = (@d = true; LIVE.delete(self))
  def disposed? = @d
end

class Win; attr_accessor :visible; def disposed? = false; end
class PokeBattle_Scene
  attr_reader :sprites, :calls
  def initialize(battle) = (@battle = battle; @sprites = { 'fightwindow' => Win.new.tap { |w| w.visible = false } }; @calls = [])
  def pbFrameUpdate(cw, update_cw = true) = (@calls << :frame; nil)
  def pbEndBattle(result) = (@calls << :end; result)
  def pbShowBattleStats(b) = (@calls << :stats; nil)
end
class Battle
  attr_accessor :battlers
  def isOnline? = false
  def pbIsOpposing?(i) = i.odd?
end
class OnlineBattle < Battle; def isOnline? = true; end

def check(label, expected, actual)
  raise "#{label}: expected #{expected.inspect}, got #{actual.inspect}" unless expected == actual
end

RULES = { 'chart' => { 'ELECTRIC' => { 'WATER' => 2, 'FLYING' => 2, 'GROUND' => 0, 'GRASS' => 0.5 }, 'ROCK' => { 'FLYING' => 2 }, 'FIRE' => { 'GRASS' => 2, 'WATER' => 0.5 },
                        'GROUND' => { 'FLYING' => 0, 'WATER' => 2 }, 'WATER' => { 'FIRE' => 2 }, 'FLYING' => { 'GRASS' => 2 } },
          'remap' => [{ 'from' => 'DARK', 'to' => 'NORMAL' }], 'failing' => ['ICE'],
          'secondary' => [{ 'on' => 'GROUND', 'add' => 'WATER' }, { 'ids' => ['FLYINGPRESS'], 'add' => 'FLYING' }] }.freeze

def overlay(extra = {})
  { 'schema' => 1, 'rules' => RULES, 'updatedAt' => 'x', 'field' => { 'id' => 'NONE', 'name' => 'No field' },
    'foes' => [{ 'name' => 'Gengar', 'types' => %w[Ghost Poison], 'weak4' => [], 'weak2' => %w[Ground Psychic] }],
    'picks' => [{ 'name' => 'Umbreon', 'tag' => 'immune Psychic' }] }.merge(extra)
end

def write_overlay(data, age: 0)
  path = File.join(PP_DIR, 'overlay.json')
  File.write(path, JSON.generate(data))
  t = Time.now - age
  File.utime(t, t, path)
  PokePalOverlay.instance_variable_set(:@mtime, nil)
end

def tick(scene)
  PokePalOverlay.instance_variable_set(:@next_poll, 0.0)
  scene.pbFrameUpdate(nil)
end

def shown? = Sprite::LIVE.any?(&:visible)

