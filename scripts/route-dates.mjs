// Writes the last-edited date (from git) for each route's folder into
// src/app/(app)/site-map/edited.json. Run: npm run site-map:dates
// Needs full git history, so run it locally (not on a shallow clone).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const dir = "src/app/(app)/site-map";
const src = readFileSync(`${dir}/routes.ts`, "utf8");
const paths = [...src.matchAll(/path: "([^"]+)"/g)].map((m) => m[1]);

const out = {};
for (const p of paths) {
  let target;
  if (p === "/") target = "src/app/page.tsx";
  else {
    const inApp = `src/app/(app)${p}`;
    target = existsSync(inApp) ? inApp : `src/app${p}`;
  }
  const date = execFileSync("git", ["log", "-1", "--format=%as", "--", target], {
    encoding: "utf8",
  }).trim();
  if (date) out[p] = date;
}

writeFileSync(`${dir}/edited.json`, JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote ${Object.keys(out).length} dates`);
