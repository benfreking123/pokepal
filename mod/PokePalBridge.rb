# PokePal bridge: writes read-only battle state for PokePal. Delete this file to uninstall.
# To switch it off without uninstalling, set ENABLED below to false, or create an empty file
# named "disabled" in the PokePal folder next to the save.
module PokePalBridge
  ENABLED = true unless const_defined?(:ENABLED, false)
  VERSION = '1.0.0' unless const_defined?(:VERSION, false)
  SCHEMA = 1 unless const_defined?(:SCHEMA, false)
  # Survives F12 soft resets, which re-run every script in the same Ruby VM.
  HOOKED = {} unless const_defined?(:HOOKED, false)

  def self.encode(v)
    case v
    when nil then 'null'
    when true then 'true'
    when false then 'false'
    when Integer then v.to_s
    when Float then v.finite? ? v.to_s : 'null'
    when Symbol then encode(v.to_s)
    when String
      '"' + v.dup.force_encoding('UTF-8').scrub.gsub(/["\\\u0000-\u001f]/) { |c| c == '"' ? '\\"' : c == '\\' ? '\\\\' : format('\\u%04x', c.ord) } + '"'
    when Array then '[' + v.map { |x| encode(x) }.join(',') + ']'
    when Hash then '{' + v.map { |k, x| encode(k.to_s) + ':' + encode(x) }.join(',') + '}'
    else encode(v.to_s)
    end
  end

  # Every game-specific call lives in this module (Reborn 19.5.0, see docs/environment-findings.md).
  module Game
    # Only battlers that hold a Pokemon; singles never use slots 2 and 3.
    def self.battlers(battle)
      limit = battle.doublebattle ? 4 : 2
      battle.battlers.compact.select { |b| b.index < limit && b.pokemon }
    end

    def self.foe?(_battle, b)
      b.index.odd?
    end

    # Battle.rb:1790-1865 and Battler.rb:20-21: live types, including field and move type changes.
    def self.types(b)
      [b.type1, b.type2].compact.uniq
    end

    # An Illusion disguise shows the disguised species and name, but type1/type2 are the real types.
    # Report no types for a disguised foe so the real ones don't leak; the app falls back to the
    # shown species' own types.
    def self.disguised?(b)
      effects = b.respond_to?(:effects) ? b.effects : nil
      effects.is_a?(Hash) && !!effects[:Illusion]
    end

    def self.hp_percent(hp, total)
      total.to_i > 0 ? (hp.to_i * 100.0 / total.to_i).round : 0
    end

    def self.fainted?(b)
      b.hp.to_i <= 0
    end

    # Battle_Field.rb:2 (.effect) and DataObjects.rb:776 ($cache.FEData[effect].name).
    def self.field(battle)
      id = battle.field.effect
      name = begin
        defined?($cache) && $cache.FEData[id].name
      rescue StandardError
        nil
      end
      { 'id' => id.to_s, 'name' => (name || id).to_s }
    end

    def self.double?(battle)
      !!battle.doublebattle
    end

    # Battle.rb:267: an Array in double trainer battles, nil in wild battles.
    def self.trainer(battle)
      t = battle.opponent
      t = t.compact.first if t.is_a?(Array)
      t ? { 'type' => t.trainertype.to_s, 'name' => t.name.to_s } : nil
    end

    def self.party(battle)
      battle.party1.compact
    end

    def self.active_pokemon(battle)
      battlers(battle).reject { |b| foe?(battle, b) }.map(&:pokemon)
    end

    # Battle.rb:363 (false) and Online/Battle_Online.rb:30 (true); the class name check is a second
    # line of defence in case a subclass doesn't override the method.
    def self.online?(battle)
      return true if battle.respond_to?(:isOnline?) && battle.isOnline?
      battle.class.ancestors.any? { |k| k.name.to_s =~ /Online/ }
    end

    # Battle_Scene.rb:1800: the text of the paused message the game shows before a trainer sends in its next
    # Pokemon ("Prodigy Noel is about to send in Porygon-Z."). Only that announced name is read from it.
    def self.incoming_name(msg)
      m = /\bis about to send in (.+?)\.?\z/.match(msg.to_s)
      m && m[1]
    end

    # The announced Pokemon from the opposing party: healthy, not already on the field, and named as announced.
    def self.incoming(battle, name)
      return nil unless battle.respond_to?(:party2)
      active = battlers(battle).map(&:pokemon)
      party = battle.party2.to_a
      i = party.index { |pk| pk && pk.hp.to_i > 0 && pk.name.to_s == name && active.none? { |a| a.equal?(pk) } }
      return nil if i.nil?
      pk = party[i]
      types = pk.respond_to?(:type1) ? [pk.type1, pk.respond_to?(:type2) ? pk.type2 : nil].compact.uniq.map(&:to_s) : []
      { 'slot' => i, 'species' => pk.species.to_s, 'form' => pk.form.to_i, 'level' => pk.level.to_i, 'types' => types }
    end

    # RTP.rb:80-82
    def self.save_dir
      File.dirname(RTP.getSaveFileName('Game.rxdata'))
    end
  end

  def self.build_state(battle, state)
    foes = Game.battlers(battle).select { |b| Game.foe?(battle, b) }.each_with_index.map do |b, i|
      { 'slot' => i, 'name' => b.name.to_s, 'species' => b.species.to_s, 'form' => b.form.to_i, 'formName' => nil,
        'level' => b.level.to_i, 'types' => Game.disguised?(b) ? [] : Game.types(b).map(&:to_s),
        'hpPercent' => Game.hp_percent(b.hp, b.totalhp), 'fainted' => Game.fainted?(b) }
    end
    active = Game.active_pokemon(battle)
    party = Game.party(battle).map do |pk|
      { 'species' => pk.species.to_s, 'form' => pk.form.to_i, 'nickname' => pk.name.to_s, 'level' => pk.level.to_i,
        'hpPercent' => Game.hp_percent(pk.hp, pk.totalhp), 'fainted' => pk.hp.to_i <= 0, 'active' => active.any? { |a| a.equal?(pk) } }
    end
    { 'schema' => SCHEMA, 'bridgeVersion' => VERSION, 'updatedAt' => Time.now.utc.strftime('%Y-%m-%dT%H:%M:%SZ'),
      'battleId' => battle.instance_variable_get(:@pokepal_id) || '', 'state' => state, 'isDouble' => Game.double?(battle),
      'field' => Game.field(battle), 'trainer' => Game.trainer(battle), 'foes' => foes, 'party' => party,
      'incoming' => battle.instance_variable_get(:@pokepal_incoming) }
  end

  @last = nil
  @disabled = false

  def self.dir
    File.join(Game.save_dir, 'PokePal')
  end

  def self.replace_file(tmp, path)
    File.rename(tmp, path)
  rescue SystemCallError
    File.delete(path) if File.exist?(path)
    File.rename(tmp, path)
  end

  def self.log_error(e)
    Dir.mkdir(dir) unless File.directory?(dir)
    File.open(File.join(dir, 'bridge_error.log'), 'a') do |f|
      f.puts("#{Time.now} #{e.class}: #{e.message}")
      f.puts((e.backtrace || []).first(5).join("\n"))
    end
  rescue StandardError
    nil
  end

  def self.safely
    return if @disabled
    yield
  rescue StandardError => e
    @disabled = true
    log_error(e)
  end

  def self.switched_off?(battle)
    !ENABLED || File.exist?(File.join(dir, 'disabled')) || Game.online?(battle)
  end

  def self.write(battle, state)
    return if switched_off?(battle)
    data = build_state(battle, state)
    comparable = encode(data.reject { |k, _| k == 'updatedAt' })
    return if comparable == @last
    @last = comparable
    Dir.mkdir(dir) unless File.directory?(dir)
    path = File.join(dir, 'battle_state.json')
    File.open(path + '.tmp', 'wb') { |f| f.write(encode(data)) }
    replace_file(path + '.tmp', path)
  end

  # Wraps klass#name without adding alias names to the class, so it chains with alias-based
  # mods loaded before or after this file and never wraps itself twice. It redefines the method
  # (not Module#prepend): Battle_Clauses.rb aliases pbEndOfRoundPhase, and after an F12 re-run an
  # alias taken over a prepended module would call itself forever.
  def self.wrap(klass, name, before: nil, after: nil)
    return false unless klass.method_defined?(name) || klass.private_method_defined?(name)
    key = "#{klass}##{name}"
    current = klass.instance_method(name)
    return true if HOOKED[key] == current
    visibility = if klass.private_method_defined?(name) then :private
                 elsif klass.protected_method_defined?(name) then :protected
                 else :public
                 end
    klass.send(:define_method, name) do |*args, **kwargs, &block|
      PokePalBridge.safely { before.call(self, args) } if before
      begin
        current.bind(self).call(*args, **kwargs, &block)
      ensure
        PokePalBridge.safely { after.call(self, args) } if after
      end
    end
    klass.send(visibility, name)
    HOOKED[key] = klass.instance_method(name)
    true
  end

  # Battle.rb:3585 pbStartBattle (returns when the battle is over), Battle.rb:2857 pbOnActiveOne
  # (every send-out and switch-in), Battle.rb:4372 pbEndOfRoundPhase.
  # Battle_Scene.rb:1800 (scene) pbDisplayPausedMessage(msg) shows the "is about to send in" announcement; the
  # bridge records the announced Pokemon before the message is shown and clears it when a foe is sent out.
  def self.announce(scene, args)
    battle = scene.instance_variable_get(:@battle)
    return if battle.nil? || Game.online?(battle)
    name = Game.incoming_name(args[0])
    return unless name
    inc = Game.incoming(battle, name)
    return unless inc
    battle.instance_variable_set(:@pokepal_incoming, inc)
    write(battle, 'active')
  end

  def self.clear_incoming(battle)
    battle.instance_variable_set(:@pokepal_incoming, nil)
  end

  def self.install_hooks
    return unless defined?(::PokeBattle_Battle)
    wrap(::PokeBattle_Battle, :pbStartBattle,
         before: ->(b, _a) { b.instance_variable_set(:@pokepal_id, "#{Time.now.to_i}-#{rand(10_000)}") unless Game.online?(b); write(b, 'active') },
         after: ->(b, _a) { clear_incoming(b); write(b, 'ended') })
    wrap(::PokeBattle_Battle, :pbOnActiveOne,
         after: lambda { |b, a|
           clear_incoming(b) if a[0].respond_to?(:index) && Game.foe?(b, a[0])
           write(b, 'active')
         })
    wrap(::PokeBattle_Battle, :pbEndOfRoundPhase, after: ->(b, _a) { write(b, 'active') })
    wrap(::PokeBattle_Scene, :pbDisplayPausedMessage, before: ->(s, a) { announce(s, a) }) if defined?(::PokeBattle_Scene)
  end
end

PokePalBridge.install_hooks
