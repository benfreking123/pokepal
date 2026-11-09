import { expect, it } from "vitest";
import { gameIsRunning, parseProcessList } from "../server/crossplay/gameProcess";

const gameDir = "C:\\Users\\Ben\\Desktop\\Reborn-19.5.0";

it("parses name|path lines, including a hidden path", () => {
  expect(parseProcessList("Game.exe|C:\\Users\\Ben\\Desktop\\Reborn-19.5.0\\Game.exe\r\nGame.exe|\r\n")).toEqual([
    { name: "Game.exe", exePath: "C:\\Users\\Ben\\Desktop\\Reborn-19.5.0\\Game.exe" },
    { name: "Game.exe", exePath: null },
  ]);
});

it("matches only the Game.exe inside gameDir", () => {
  const reborn = { name: "Game.exe", exePath: "c:\\users\\ben\\desktop\\reborn-19.5.0\\Game.exe" };
  const other = { name: "Game.exe", exePath: "C:\\Games\\Rejuvenation\\Game.exe" };
  expect(gameIsRunning([reborn], ["Game.exe"], gameDir)).toBe(true);
  expect(gameIsRunning([other], ["Game.exe"], gameDir)).toBe(false);
  expect(gameIsRunning([other], ["Game.exe"], null)).toBe(true);
  expect(gameIsRunning([{ name: "Game.exe", exePath: null }], ["Game.exe"], gameDir)).toBe(true);
  expect(gameIsRunning([], ["Game.exe"], gameDir)).toBe(false);
});
