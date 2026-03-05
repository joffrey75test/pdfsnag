import { mkdirSync, cpSync } from "node:fs";
import { join } from "node:path";

const src = "node_modules/pdfjs-dist";
const dst = "public/pdfjs";

mkdirSync(dst, { recursive: true });

const copies = [
  ["build", "build"],
  ["web", "web"],
  ["cmaps", "cmaps"],
  ["standard_fonts", "standard_fonts"],
];

for (const [from, to] of copies) {
  const fromPath = join(src, from);
  const toPath = join(dst, to);
  mkdirSync(toPath, { recursive: true });
  cpSync(fromPath, toPath, { recursive: true });
}

console.log("Copied pdfjs-dist assets to public/pdfjs/");
