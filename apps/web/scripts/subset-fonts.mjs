import fs from "node:fs";
import subsetFont from "subset-font"; // npm i --prefix /tmp/subset subset-font
const [input, output] = process.argv.slice(2);
const ranges = [[0x20, 0x7e], [0xa0, 0x17f], [0x2010, 0x2027], [0x2030, 0x203a], [0x2190, 0x2199], [0x20ac, 0x20ac], [0x20b9, 0x20b9], [0x2122, 0x2122], [0x2318, 0x2318], [0x21b5, 0x21b5], [0x2713, 0x2713], [0x2715, 0x2715]];
let text = "";
for (const [a, b] of ranges) for (let c = a; c <= b; c++) text += String.fromCodePoint(c);
const src = fs.readFileSync(input);
const out = await subsetFont(src, text, { targetFormat: "woff2" });
fs.writeFileSync(output, out);
console.log(`${input.split("/").pop()}: ${(src.length / 1024).toFixed(1)}KB → ${(out.length / 1024).toFixed(1)}KB`);
