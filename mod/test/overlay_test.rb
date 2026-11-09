# Runs with any Ruby >= 3.0: ruby mod/test/overlay_test.rb (stand-in RGSS classes, no game needed)
require_relative 'support'

# What an alias-based mod (SWM, ...) does, before and after us.
PokeBattle_Scene.class_eval do
  alias other_pbFrameUpdate pbFrameUpdate
  def pbFrameUpdate(*args) = (@calls << :other; other_pbFrameUpdate(*args))
end
load MOD
load MOD
PokeBattle_Scene.class_eval do
  alias later_pbFrameUpdate pbFrameUpdate
  def pbFrameUpdate(*args) = (@calls << :later; later_pbFrameUpdate(*args))
end

check('json parser matches stdlib', JSON.parse('{"a":[1,2.5,-3e2,true,false,null,"x\\u00e9\\n\\"q"],"b":{}}'),
      PokePalOverlay::Json.parse('{"a":[1,2.5,-3e2,true,false,null,"x\\u00e9\\n\\"q"],"b":{}}'))
begin
  PokePalOverlay::Json.parse('{"a":')
  raise 'no error'
rescue PokePalOverlay::Json::Error
end

s = PokeBattle_Scene.new(Battle.new)
check('chain order, wrapped once', [:later, :other, :frame], (s.pbFrameUpdate(nil); s.calls))

check('missing file draws nothing', false, (tick(s); shown?))
write_overlay(overlay)
tick(s)
check('draws from a fresh file', true, shown?)
check('one bitmap', 1, Bitmap::LIVE.size)
tick(s)
check('unchanged content is not redrawn', 1, Bitmap::LIVE.size)

write_overlay(overlay, age: 6)
tick(s)
check('stale file hides it', false, shown?)
write_overlay(overlay)
tick(s)
check('fresh again shows it', true, shown?)

Input.press!
tick(s)
check('F6 hides', false, shown?)
Input.press!
tick(s)
check('F6 shows', true, shown?)

s.sprites['fightwindow'].visible = true
tick(s)
check('hidden in the fight menu', false, shown?)
s.sprites['fightwindow'].visible = false
tick(s)
check('back after the fight menu', true, shown?)

s.pbShowBattleStats(nil)
check('inspect restores afterwards', true, (tick(s); shown?))
PokePalOverlay.block
check('hidden while inspect is open', false, (s.pbFrameUpdate(nil); shown?))
PokePalOverlay.unblock

File.write(File.join(PP_DIR, 'disabled'), '')
check('disabled file hides it', [false, 0], (tick(s); [shown?, Sprite::LIVE.size]))
File.delete(File.join(PP_DIR, 'disabled'))

write_overlay(overlay)
tick(s)
s.pbEndBattle(:won)
check('battle end disposes sprites and bitmaps', [0, 0], [Sprite::LIVE.size, Bitmap::LIVE.size])
tick(s)
check('no sprite is recreated for an ended scene', 0, Sprite::LIVE.size)

online = PokeBattle_Scene.new(OnlineBattle.new)
write_overlay(overlay)
tick(online)
check('online battle never draws', 0, Sprite::LIVE.size)

s2 = PokeBattle_Scene.new(Battle.new)
tick(s2)
check('next offline battle draws again', true, shown?)

PokePalOverlay.define_singleton_method(:draw) { |_d| raise 'boom' }
write_overlay(overlay(' x' => 1))
s3 = PokeBattle_Scene.new(Battle.new)
check('errors never reach the game', :won, (tick(s3); s3.pbEndBattle(:won)))
check('first error disposes and logs', [0, true], [Sprite::LIVE.size, File.exist?(File.join(PP_DIR, 'overlay_error.log'))])
check('overlay stays off after an error', 0, (tick(s3); Sprite::LIVE.size))
puts 'overlay mod ok'
