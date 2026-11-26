/**
 * Dev tool: run the parsers on saved HTML and print the result — handy when Internshala changes its markup.
 *
 *   tsx scripts/inspect.ts listing <file.html> [--full]
 *   tsx scripts/inspect.ts detail  <file.html>
 */
import { readFileSync } from "node:fs";
import { parseDetailPage } from "../src/parse/detail";
import { parseListingPage } from "../src/parse/listing";

const [mode, file] = process.argv.slice(2);
if (!file || (mode !== "listing" && mode !== "detail")) {
  console.error("usage: tsx scripts/inspect.ts <listing|detail> <file.html> [--full]");
  process.exit(2);
}
const html = readFileSync(file, "utf8");
if (mode === "listing") {
  const page = parseListingPage(html);
  const { cards, ...meta } = page;
  console.log(JSON.stringify(meta));
  if (process.argv.includes("--full")) console.log(JSON.stringify(cards, null, 2));
  else
    for (const c of cards)
      console.log(
        [c.id, c.kind, c.pinned ? "PIN" : "", c.title, "@", c.company, "|", c.locations.join("/"), c.isWfh ? "(WFH)" : "", "|", c.salaryText,
          "|", c.durationText ?? c.experienceText, "|", c.postedText, "|", c.labels.join("+"), c.ppoText ?? "", "|", c.skills.length, "skills",
          c.logoUrl ? "logo" : "no-logo"].join(" "),
      );
} else {
  const d = parseDetailPage(html);
  if (!d) {
    console.log("null (not a detail page)");
  } else {
    const { sections, jsonLd, ...rest } = d;
    console.log(JSON.stringify(rest, null, 2));
    for (const s of sections) console.log(`--- [${s.kind}] ${s.heading}: ${s.items.length} items · ${s.html.length} chars html`);
    console.log("jsonLd:", jsonLd ? JSON.stringify({ ...jsonLd, descriptionHtml: `${jsonLd.descriptionHtml?.length ?? 0} chars` }) : null);
  }
}
