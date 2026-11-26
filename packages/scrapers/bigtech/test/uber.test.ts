import { describe, expect, it } from "vitest";
import { uber, UBER_DISABLED_REASON } from "../src/sites/uber";
import { collect, fakeHttp } from "./helpers";

describe("uber (disabled)", () => {
  it("is disabled with a documented reason", () => {
    expect(uber.id).toBe("uber");
    expect(uber.kind).toBe("career_site");
    expect(uber.isEnabled?.({})).toBe(false);
    expect(uber.disabledReason).toBe(UBER_DISABLED_REASON);
    expect(UBER_DISABLED_REASON).toMatch(/Cloudflare managed challenge/);
  });

  it("refuses to run and makes no requests if called anyway", async () => {
    const http = fakeHttp([]);
    await expect(collect(uber, { http })).rejects.toThrow(/uber is disabled/);
    expect(http.calls).toHaveLength(0);
  });
});
