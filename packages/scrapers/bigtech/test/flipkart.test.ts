import { describe, expect, it } from "vitest";
import { flipkart } from "../src/sites/flipkart";
import { collect, fakeHttp } from "./helpers";

describe("flipkart (disabled)", () => {
  it("is disabled with a documented reason and makes no requests", async () => {
    expect(flipkart.isEnabled?.({})).toBe(false);
    expect(flipkart.disabledReason).toMatch(/TurboHire.*robots\.txt/);
    const http = fakeHttp([]);
    expect(await collect(flipkart, { http })).toEqual([]);
    expect(http.calls).toHaveLength(0);
  });
});
