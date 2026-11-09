import { expect, it } from "vitest";
import { stableStringify, updateManifest } from "../src/write";

it("sorts keys at every level", () => {
  expect(stableStringify({ b: 1, a: { d: [{ z: 1, y: 2 }], c: null } })).toBe(
    '{\n  "a": {\n    "c": null,\n    "d": [\n      {\n        "y": 2,\n        "z": 1\n      }\n    ]\n  },\n  "b": 1\n}\n',
  );
});

it("adds a version to the manifest and sets latest", () => {
  expect(updateManifest({ latest: "19.5.40", versions: ["19.5.40"] }, "19.5.43")).toEqual({ latest: "19.5.43", versions: ["19.5.40", "19.5.43"] });
  expect(updateManifest(null, "19.5.43")).toEqual({ latest: "19.5.43", versions: ["19.5.43"] });
});
