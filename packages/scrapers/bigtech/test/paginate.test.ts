import { describe, expect, it } from "vitest";
import { paginate } from "../src/lib/paginate";

const collect = async <T>(it: AsyncIterable<T>): Promise<T[]> => {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
};

describe("paginate truncation (W1: never sweep a cut-off listing)", () => {
  it("calls onTruncated when maxPages ends the listing early", async () => {
    const reasons: string[] = [];
    const items = await collect(
      paginate<number>({
        pageSize: 2,
        maxPages: 2,
        fetchPage: async (i) => ({ items: [i * 2, i * 2 + 1], hasMore: true }),
        onTruncated: (r) => reasons.push(r),
      }),
    );
    expect(items).toEqual([0, 1, 2, 3]);
    expect(reasons).toEqual(["listing truncated at maxPages=2"]);
  });

  it("does not call onTruncated when the listing ends on its own", async () => {
    const reasons: string[] = [];
    await collect(
      paginate<number>({
        pageSize: 2,
        maxPages: 5,
        fetchPage: async (i) => ({ items: i < 2 ? [i * 2, i * 2 + 1] : [i * 2], hasMore: i < 2 }),
        onTruncated: (r) => reasons.push(r),
      }),
    );
    expect(reasons).toEqual([]);
  });
});
