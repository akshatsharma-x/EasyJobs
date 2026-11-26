import { describe, expect, it } from "vitest";
import { meta, META_DISABLED_REASON } from "../src/sites/meta";
import { collect, fakeHttp } from "./helpers";

describe("meta (disabled)", () => {
  it("is disabled with a documented reason", () => {
    expect(meta.id).toBe("meta");
    expect(meta.kind).toBe("career_site");
    expect(meta.isEnabled?.({})).toBe(false);
    expect(meta.disabledReason).toBe(META_DISABLED_REASON);
    expect(META_DISABLED_REASON).toMatch(/prohibited unless you have express written permission/);
  });

  it("never makes a request, even when scrape() is called directly", async () => {
    const http = fakeHttp([]);
    const jobs = await collect(meta, { http });
    expect(jobs).toEqual([]);
    expect(http.calls).toEqual([]);
  });
});
