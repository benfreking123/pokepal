# Runs the real overlay mod's layout code (no game needed) and prints where each rectangle and piece of text goes.
# ruby mod/mockup/layout.rb overlay.json widths.json 'x,y,w,h;x,y,w,h' > layout.json
require 'json'
require_relative '../test/support'
load MOD

overlay = JSON.parse(File.read(ARGV[0]))
widths = JSON.parse(File.read(ARGV[1]))
boxes = ARGV[2].to_s.split(';').map { |b| b.split(',').map(&:to_i) }
tw = ->(s) { s.to_s.each_char.sum { |c| widths['w'][c] || widths['default'] } }
puts JSON.generate(PokePalOverlay.layout(overlay, tw, boxes))
