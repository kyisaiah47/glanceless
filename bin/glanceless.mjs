#!/usr/bin/env node
/* glanceless now runs ShipProbe.
 *
 *   glanceless <url|file|dir> [...]     runs shipprobe page with glanceless's seven rules
 *   glanceless rules                    runs shipprobe rules
 *   glanceless demo                     the bundled fixtures, a clean one and a failing one
 *
 * Exit codes: 0 clean, 1 a finding, 2 could not check. 2 never collapses into 0 or 1.
 */
import path from 'node:path';
import { ROOT, VERSION, GLANCELESS_RULES, notice, shipprobe } from '../src/forward.mjs';

const USAGE = `glanceless ${VERSION} now runs ShipProbe: https://shipprobe.thecompound.tech/page

  glanceless <url|file|dir> [<url|file|dir> ...]

  --only <ids>     run only these rules, comma separated
  --skip <ids>     run every glanceless rule except these
  --vw <widths>    viewport widths, comma separated (default 1440)
  --home <url>     the front page the page-chrome rule compares against
                   (default: the target's own origin at /)
  --sitemap        read the origin's sitemap.xml and add interior routes
  --routes <n>     how many routes --sitemap may add per origin (default 6)
  --json           machine-readable output
  --quiet          only print findings
  --version        print the version
  --help           this

  glanceless rules
  glanceless demo

Rules: ${GLANCELESS_RULES.join(', ')}. Any other shipprobe page rule can be named with --only.

Exit codes
  0  checked, clean
  1  checked, and the page violates something
  2  could not check. It never collapses into 0, and never into 1.

There is no --force, no allowlist and no known-issues file.`;

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
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

notice();

if (takeBool('help') || argv[0] === 'help' || argv[0] === '-h') {
  console.log(USAGE);
  process.exit(0);
}
if (takeBool('version')) {
  console.log(VERSION);
  process.exit(0);
}

if (argv[0] === 'rules') {
  console.log(`glanceless runs these rules by default: ${GLANCELESS_RULES.join(', ')}.\n`);
  process.exit(shipprobe(['rules']));
}

const JSON_OUT = takeBool('json');
const QUIET = takeBool('quiet');
const ONLY = list(takeFlag('only'));
const SKIP = list(takeFlag('skip'));
const HOME = takeFlag('home');
const SITEMAP = takeBool('sitemap');
const N_ROUTES = Number(takeFlag('routes', '6')) || 6;
const VIEWPORTS = list(takeFlag('vw', '1440')) || ['1440'];

/* The rule set: the named rules, or glanceless's seven, less anything skipped. --skip is passed
 * on as well, so shipprobe refuses an id it does not know rather than this file dropping it. */
function ruleArgs(only, skip) {
  const out = [];
  const base = only || GLANCELESS_RULES;
  const keep = base.filter((r) => !(skip || []).includes(r));
  out.push('--only', (keep.length ? keep : base).join(','));
  if (skip && skip.length) out.push('--skip', skip.join(','));
  return out;
}

/* shipprobe page flags glanceless never had. They pass through with their values, and shipprobe
 * refuses any flag it does not know with exit 2. */
const passThrough = [];
for (const name of ['settle', 'accent', 'sample']) {
  const v = takeFlag(name);
  if (v !== null) passThrough.push(`--${name}`, v);
}
const targets = argv.filter((a) => !a.startsWith('--'));
passThrough.push(...argv.filter((a) => a.startsWith('--')));

if (targets[0] === 'demo') {
  const dir = path.join(ROOT, 'test', 'fixtures');
  const clean = path.join(dir, 'clean.html');
  const dirty = path.join(dir, 'dirty.html');
  const rules = ruleArgs(null, ['page-chrome']);
  console.log('glanceless demo: two pages. Both build. Both render. One of them was not looked at.\n');
  console.log(`--- ${path.relative(ROOT, clean)}`);
  const a = shipprobe(['page', clean, '--vw', '1440', ...rules]);
  console.log(`\n--- ${path.relative(ROOT, dirty)}`);
  const b = shipprobe(['page', dirty, '--vw', '1440', ...rules]);
  const ok = a === 0 && b === 1;
  console.log(
    `\ndemo: the clean page exits ${a} and the failing page exits ${b}. ` +
      (ok ? 'That is the whole product.' : 'THAT IS WRONG, and this demo is also a test.'),
  );
  process.exit(ok ? 0 : 1);
}

if (!targets.length) {
  console.error(USAGE);
  process.exit(2);
}

const args = ['page', ...targets, '--vw', VIEWPORTS.join(','), ...ruleArgs(ONLY, SKIP)];
if (HOME) args.push('--home', HOME);
if (SITEMAP) args.push('--sample', String(N_ROUTES));
if (JSON_OUT) args.push('--json');
if (QUIET) args.push('--quiet');
process.exit(shipprobe([...args, ...passThrough]));
