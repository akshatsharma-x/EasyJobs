import { describe, expect, it } from "vitest";
import { TECH_MAHINDRA_DISABLED_REASON, techMahindra } from "../src/sites/tech-mahindra";
import { collect, fakeHttp } from "./helpers";

describe("tech-mahindra", () => {
  it("is disabled with a documented reason", () => {
    expect(techMahindra.id).toBe("tech-mahindra");
    expect(techMahindra.kind).toBe("career_site");
    expect(techMahindra.isEnabled?.({})).toBe(false);
    expect(techMahindra.disabledReason).toBe(TECH_MAHINDRA_DISABLED_REASON);
  });

  it("makes no requests and emits nothing if run anyway", async () => {
    const http = fakeHttp([]);
    expect(await collect(techMahindra, { http })).toEqual([]);
    expect(http.calls).toEqual([]);
  });
});
