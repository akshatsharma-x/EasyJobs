import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { normalizeSearchText, parseText, tsqueryExpr } from "../src/search/text";
import { createTestDb, type TestDb } from "./helpers";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.cleanup();
});

describe("query parsing", () => {
  it("expands synonym phrases greedily and keeps prefix on the last token", () => {
    const p = parseText("software engineer bangalore");
    expect(p.groups.map((g) => g.alternatives[0])).toEqual(["sde", "bangalore"]);
    expect(p.groups[0]!.alternatives).toContain("software developer");
    expect(p.groups[1]!.alternatives).toContain("bengaluru");
    expect(p.groups[1]!.prefix).toBe("bangalore");
    expect(p.groups[0]!.prefix).toBeNull();
  });
  it("handles quotes, negation and OR", () => {
    const p = parseText('"data analyst" -senior python or java');
    expect(p.groups[0]).toMatchObject({ alternatives: ["data analyst"], phrase: true, negated: false });
    expect(p.groups[1]).toMatchObject({ alternatives: ["senior"], negated: true });
    expect(p.groups[2]).toMatchObject({ alternatives: ["python"], orNext: true });
    expect(p.groups[3]!.alternatives).toEqual(["java"]);
    expect(p.words).toEqual(["python", "java"]);
  });
  it("strips tsquery syntax so user input can never break to_tsquery", async () => {
    for (const q of ["a & b | c", "foo:* bar", "(x) <-> 'y'", "!!!", "c++ & c# .net node.js", "\\", "' OR 1=1 --"]) {
      const expr = tsqueryExpr(parseText(q));
      if (!expr) continue;
      await expect(t.db.query(sql`SELECT (${expr})::text AS q`)).resolves.toBeDefined();
    }
  });
});

describe("token normalisation parity (JS query side == SQL document side)", () => {
  const samples = [
    "C++ Developer",
    "Senior C# / .NET Engineer",
    "Node.js and React.js developer",
    "ASP.NET Core, F# and Vue.js",
    "next.js / express.js",
    "Golang (Go) engineer",
    "abc#def c#",
  ];
  for (const s of samples) {
    it(s, async () => {
      const [row] = await t.db.query<{ doc: string; query: string }>(sql`
        SELECT array_to_string(tsvector_to_array(to_tsvector('simple', ej_search_norm(${s}))), ' ') AS doc,
               array_to_string(tsvector_to_array(to_tsvector('simple', ${normalizeSearchText(s)})), ' ') AS query`);
      expect(row!.query).toBe(row!.doc);
    });
  }
});
