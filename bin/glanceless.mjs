#!/usr/bin/env node
/* glanceless: page-level design rules, measured in a real browser, fail closed.
 *
 *   glanceless <url|file|dir> [...]     check one or more pages
 *   glanceless rules                    what each rule measures, and its id
 *   glanceless demo                     the bundled fixtures, a clean one and a failing one
 *
 * Exit codes: 0 clean, 1 a finding, 2 could not check. 2 never collapses into 0 or 1.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTargets } from "../src/run.mjs";
import { printReport } from "../src/report.mjs";
import { RULES, RULE_IDS } from "../src/rules/index.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

const USAGE = `glanceless ${PKG.version}

  glanceless <url|file|dir> [<url|file|dir> ...]

  --only <ids>     run only these rules, comma separated
  --skip <ids>     run every rule except these
  --vw <widths>    viewport widths, comma separated (default 1440)
  --home <url>     the front page the page-chrome rule compares against
                   (default: the target's own origin at /)
  --sitemap        read the origin's sitemap.xml and add one interior route per
                   distinct first path segment
  --routes <n>     how many routes --sitemap may add per origin (default 6)
  --json           machine-readable output
  --quiet          only print findings
  --version        print the version
  --help           this

  glanceless rules
  glanceless demo

Rules: ${RULE_IDS.join(", ")}

A local file or directory is served over HTTP on an ephemeral loopback port, because a
file:// image taints the canvas and the figure rule's density measurement would report
"the pixels could not be read" for every picture on the page.

Exit codes
  0  checked, clean
  1  checked, and the page violates something
  2  could not check. It never collapses into 0, and never into 1.

There is no --force, no allowlist and no known-issues file. Each of those is a supported
way to record a failure and ship past it.`;

const argv = process.argv.slice(2);
const takeFlag = (name, dflt = null) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return dflt;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const takeBool = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return false;
  argv.splice(i, 1);
  return true;
};
const list = (v) =>
  v === null || v === undefined
    ? null
    : String(v)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

if (takeBool("help") || argv[0] === "help" || argv[0] === "-h") {
  console.log(USAGE);
  process.exit(0);
}
if (takeBool("version")) {
  console.log(PKG.version);
  process.exit(0);
}

if (argv[0] === "rules") {
  console.log(`glanceless ${PKG.version}: ${RULES.length} rules\n`);
  for (const r of RULES) {
    console.log(`  ${r.id}`);
    console.log(`    ${r.summary}\n`);
  }
  console.log("Full reasoning for each rule: docs/RULES.md, and the header of its own source file.");
  process.exit(0);
}

const JSON_OUT = takeBool("json");
const QUIET = takeBool("quiet");
const ONLY = list(takeFlag("only"));
const SKIP = list(takeFlag("skip"));
const HOME = takeFlag("home");
const SITEMAP = takeBool("sitemap");
const N_ROUTES = Number(takeFlag("routes", "6")) || 6;
const VIEWPORTS = (list(takeFlag("vw", "1440")) || ["1440"]).map(Number).filter((n) => n > 0);

/* ONE ROUTE PER FIRST PATH SEGMENT, NOT THE FIRST N URLS. The defect this samples for is a page
 * somebody wrote by hand, and a hand-written page is exactly the one that is not part of a
 * generated family. A sitemap of four thousand /kit/<slug> pages contributes one of them; a lone
 * /guides/exceptions contributes itself. The sample is a tour of page types rather than N
 * near-identical rows. */
async function sitemapRoutes(origin, n) {
  const out = [];
  try {
    const res = await fetch(`${origin}/sitemap.xml`, { redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (!res.ok) return out;
    const xml = await res.text();
    const bySeg = new Map();
    for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
      let u;
      try {
        u = new URL(m[1]);
      } catch {
        continue;
      }
      if (u.host !== new URL(origin).host) continue;
      const segs = u.pathname.split("/").filter(Boolean);
      if (!segs.length) continue;
      const key = segs.length === 1 ? u.pathname : `${segs[0]}/*`;
      if (bySeg.has(key)) continue;
      bySeg.set(key, u.href);
    }
    out.push(...[...bySeg.values()].slice(0, n));
  } catch {
    /* A missing or unreachable sitemap adds no routes. The targets named on the command line are
     * still checked, and the run says how many pages it measured. */
  }
  return out;
}

let targets = argv.filter((a) => !a.startsWith("--"));

if (targets[0] === "demo") {
  const dir = path.join(ROOT, "test", "fixtures");
  const clean = path.join(dir, "clean.html");
  const dirty = path.join(dir, "dirty.html");
  console.log("glanceless demo: two pages. Both build. Both render. One of them was not looked at.\n");
  console.log(`--- ${path.relative(ROOT, clean)}`);
  const a = await runTargets([clean], { viewports: [1440], skip: ["page-chrome"] });
  printReport(a, { quiet: false });
  console.log(`\n--- ${path.relative(ROOT, dirty)}`);
  const b = await runTargets([dirty], { viewports: [1440], skip: ["page-chrome"] });
  printReport(b, { quiet: false });
  const ok = a.code === 0 && b.code === 1;
  console.log(
    `\ndemo: the clean page exits ${a.code} and the failing page exits ${b.code}. ` +
      (ok ? "That is the whole product." : "THAT IS WRONG, and this demo is also a test."),
  );
  process.exit(ok ? 0 : 1);
}

if (!targets.length) {
  console.error(USAGE);
  process.exit(2);
}

if (SITEMAP) {
  const extra = [];
  for (const t of targets) {
    if (!/^https?:\/\//i.test(t)) continue;
    const origin = new URL(t).origin;
    for (const u of await sitemapRoutes(origin, N_ROUTES)) if (!targets.includes(u)) extra.push(u);
  }
  targets = [...targets, ...extra];
}

const result = await runTargets(targets, {
  viewports: VIEWPORTS,
  only: ONLY,
  skip: SKIP,
  home: HOME,
}).catch((e) => {
  if (e && e.cannotCheck) {
    console.error(`glanceless: ${e.message}`);
    process.exit(2);
  }
  throw e;
});

if (JSON_OUT) console.log(JSON.stringify(result, null, 1));
else printReport(result, { quiet: QUIET });

process.exit(result.code);
