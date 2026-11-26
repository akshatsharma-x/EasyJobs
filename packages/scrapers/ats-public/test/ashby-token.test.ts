import { describe, expect, it } from "vitest";
import { ashbyBoardUrl, encodeAshbyToken } from "../src/adapters/ashby";

describe("Ashby tokens (W1: registry tokens may already be percent-encoded)", () => {
  it("does not double-encode %20 tokens", () => {
    expect(encodeAshbyToken("Flock%20Safety")).toBe("Flock%20Safety");
    expect(ashbyBoardUrl("Hippocratic%20AI")).toBe("https://api.ashbyhq.com/posting-api/job-board/Hippocratic%20AI?includeCompensation=true");
  });
  it("still encodes plain tokens and survives malformed escapes", () => {
    expect(encodeAshbyToken("Flock Safety")).toBe("Flock%20Safety");
    expect(encodeAshbyToken("openai")).toBe("openai");
    expect(encodeAshbyToken("100%")).toBe("100%25");
  });
});
