import { expect, it } from "vitest";
import { isLocalRequest } from "../server/routes/guard";

it("accepts only loopback addresses", () => {
  for (const ip of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) expect(isLocalRequest(ip)).toBe(true);
  for (const ip of ["192.168.1.30", "::ffff:192.168.1.30", ""]) expect(isLocalRequest(ip)).toBe(false);
});
