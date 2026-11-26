import { describe, expect, it } from "vitest";
import { cognizant, COGNIZANT_DISABLED_REASON } from "../src/sites/cognizant";
import { collect, fakeHttp } from "./helpers";

describe("cognizant (disabled: Cloudflare bot challenge)", () => {
  it("is disabled with a documented reason", () => {
    expect(cognizant.isEnabled?.({})).toBe(false);
    expect(cognizant.disabledReason).toBe(COGNIZANT_DISABLED_REASON);
    expect(cognizant.kind).toBe("career_site");
    expect(cognizant.id).toBe("cognizant");
  });

  it("refuses to run and makes no requests", async () => {
    const http = fakeHttp([]);
    await expect(collect(cognizant, { http })).rejects.toThrow(/cognizant is disabled/);
    expect(http.calls).toHaveLength(0);
  });
});
