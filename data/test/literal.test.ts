import { describe, expect, it } from "vitest";
import { readRubyConstants } from "../src/ruby/literal";

describe("readRubyConstants", () => {
  it("reads nested literal hashes inside a module", async () => {
    const src = `module Data
TYPEHASH = {
  :NORMAL => { :name => "Normal", :weaknesses => [:FIGHTING], :immunities => [:GHOST], :special => false },
}
end
LIST = [1, -2, 2.5, nil, true, "x"]
`;
    const { constants } = await readRubyConstants(src);
    expect(constants.TYPEHASH).toEqual({
      NORMAL: { name: "Normal", weaknesses: ["FIGHTING"], immunities: ["GHOST"], special: false },
    });
    expect(constants.LIST).toEqual([1, -2, 2.5, null, true, "x"]);
  });

  it("stringifies numeric hash keys", async () => {
    const { constants } = await readRubyConstants("A = { 1.5 => [:FIRE], 2 => :X }\n");
    expect(constants.A).toEqual({ "1.5": ["FIRE"], "2": "X" });
  });

  it("keeps non-literal code as $ruby and constant paths as $const", async () => {
    const { constants } = await readRubyConstants(
      "A = { :t => PBTypes::FIRE, :f => lambda { |b| b.hp > 0 }, :r => 1..3 }\n",
    );
    expect(constants.A).toEqual({
      t: { $const: "PBTypes::FIRE" },
      f: { $ruby: "lambda { |b| b.hp > 0 }" },
      r: { $ruby: "1..3" },
    });
  });

  it("handles non-ASCII text (byte offsets)", async () => {
    const { constants } = await readRubyConstants('A = { :n => "Flabébé", :c => foo("é") }\n');
    expect(constants.A).toEqual({ n: "Flabébé", c: { $ruby: 'foo("é")' } });
  });

  it("reads the key shapes found in Reborn 19.5's data files", async () => {
    const { constants } = await readRubyConstants(`A = {
  :typeBoosts => { 1.5 => [:WATER], 2.0 => [:ELECTRIC], 0 => [:FIRE] },
  :fieldCounterIncreases => { [1, 1] => [:SLUDGEWAVE] },
  :seed => { :stats => { PBStats::SPEED => 1 } },
  :function => 0x01F,
  :OnCreation => proc { rand(2) },
}
`);
    expect(constants.A).toEqual({
      typeBoosts: { "1.5": ["WATER"], "2": ["ELECTRIC"], "0": ["FIRE"] },
      fieldCounterIncreases: { "[1, 1]": ["SLUDGEWAVE"] },
      seed: { stats: { "PBStats::SPEED": 1 } },
      function: 31,
      OnCreation: { $ruby: "proc { rand(2) }" },
    });
  });

  it("throws on syntax errors", async () => {
    await expect(readRubyConstants("A = {\n")).rejects.toThrow(/Ruby parse error/);
  });
});
