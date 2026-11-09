import { expect, it } from "vitest";
import { matchTrainer, searchTrainers, seenSlots } from "../shared/prep/trainers";
import type { BossView, TrainerFull } from "../shared/types";

const t = (trainerType: string, name: string, label: string, partyId: number, mons: [string, number][]): TrainerFull => ({
  key: `${trainerType}:${name}:${partyId}`, trainerType, name, label, partyId,
  mons: mons.map(([species, level]) => ({ species, form: 0, level, moves: [], ability: null, item: null })),
});
const trainers = Object.fromEntries([
  t("LEADER_JULIA", "Julia", "Leader Julia", 0, [["VOLTORB", 13], ["PLUSLE", 14]]),
  t("LEADER_JULIA", "Julia", "Leader Julia", 1, [["ELECTRODE", 60], ["PLUSLE", 61]]),
  t("YOUNGSTER", "Joey", "Youngster Joey", 0, [["RATTATA", 5], ["RATTATA", 7]]),
  t("ACE_TRAINER_F", "Julie", "Ace Trainer Julie", 0, [["MILOTIC", 70]]),
].map((x) => [x.key, x]));
const index = Object.values(trainers).map(({ key, trainerType, name, label, partyId }) => ({ key, trainerType, name, label, partyId }));
const boss = (context: BossView["context"]): BossView => ({ id: "julia", name: "Julia", variants: [{ label: "", trainerKey: "LEADER_JULIA:Julia:0" }], fieldId: "ELECTERRAIN", doubles: false, context });

it("searches every trainer, featured bosses first, ignoring case and accents", () => {
  const bosses = [boss({ group: "gym", order: 1, location: null, notes: [] })];
  expect(searchTrainers(index, bosses, "").map((h) => h.entry.key)).toEqual([
    "LEADER_JULIA:Julia:0", "ACE_TRAINER_F:Julie:0", "LEADER_JULIA:Julia:1", "YOUNGSTER:Joey:0",
  ]);
  expect(searchTrainers(index, bosses, "JÚL").map((h) => h.entry.key)).toEqual(["LEADER_JULIA:Julia:0", "ACE_TRAINER_F:Julie:0", "LEADER_JULIA:Julia:1"]);
  expect(searchTrainers(index, bosses, "youngster jo")).toMatchObject([{ entry: { key: "YOUNGSTER:Joey:0" }, boss: null }]);
  expect(searchTrainers(index, bosses, "", 2)).toHaveLength(2);
});

it("featured bosses without story context sort by name", () => {
  const a = { ...boss(null), id: "a", name: "Zed", variants: [{ label: "", trainerKey: "YOUNGSTER:Joey:0" }] };
  const b = { ...boss(null), id: "b", name: "Amy", variants: [{ label: "", trainerKey: "ACE_TRAINER_F:Julie:0" }] };
  expect(searchTrainers(index, [a, b], "").slice(0, 2).map((h) => h.boss?.name)).toEqual(["Amy", "Zed"]);
});

it("maps the foes on the field to party slots", () => {
  const joey = trainers["YOUNGSTER:Joey:0"];
  expect(seenSlots(joey, [{ species: "RATTATA", form: 0, level: 7 }])).toEqual([1]);
  expect(seenSlots(joey, [{ species: "RATTATA", form: 0, level: 5 }, { species: "RATTATA", form: 0, level: 7 }])).toEqual([0, 1]);
  expect(seenSlots(joey, [{ species: "PIDGEY", form: 0, level: 5 }])).toEqual([]);
});

it("matches a live battle to the right party", () => {
  expect(matchTrainer(trainers, { type: "YOUNGSTER", name: "Joey" }, [])).toEqual({ key: "YOUNGSTER:Joey:0", exact: true });
  expect(matchTrainer(trainers, { type: "LEADER_JULIA", name: "Julia" }, [{ species: "ELECTRODE", form: 0, level: 60 }])).toEqual({ key: "LEADER_JULIA:Julia:1", exact: true });
  expect(matchTrainer(trainers, { type: "LEADER_JULIA", name: "Julia" }, [{ species: "PLUSLE", form: 0, level: 14 }])).toEqual({ key: "LEADER_JULIA:Julia:0", exact: true });
  expect(matchTrainer(trainers, { type: "LEADER_JULIA", name: "Julia" }, [])).toEqual({ key: "LEADER_JULIA:Julia:0", exact: false });
  expect(matchTrainer(trainers, { type: "LEADER_X", name: "Nobody" }, [])).toBeNull();
});
