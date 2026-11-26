import type * as cheerio from "cheerio";
import type { Cheerio } from "cheerio";

/**
 * cheerio does not re-export domhandler's node types and pnpm's strict layout keeps `domhandler`
 * out of reach, so derive `AnyNode` from cheerio's own `load(content: string | AnyNode | AnyNode[] | Buffer)`.
 */
export type AnyNode = Exclude<Parameters<typeof cheerio.load>[0], string | Buffer | readonly unknown[]>;

/** A cheerio selection of any node type. */
export type Sel = Cheerio<AnyNode>;
