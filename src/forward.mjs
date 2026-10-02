/* glanceless now runs ShipProbe.
 *
 * The glanceless command forwards to `shipprobe page`, which holds the same rules, and the exit
 * code comes back unchanged:
 *
 *   0  checked, clean
 *   1  checked, and the page violates something
 *   2  could not check. It never collapses into 0, and never into 1.
 *
 * A missing shipprobe install is exit 2, because nothing was checked.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

/* The seven rules glanceless ran. shipprobe page has more, so a glanceless run names these seven
 * and a page that passed glanceless 0.1 is not failed by a rule it never ran. numeral-label is the
 * rule glanceless listed under a different id. */
export const GLANCELESS_RULES = ['contrast', 'dead-column', 'page-chrome', 'figure', 'numeral-label', 'table-shape', 'noise'];

function shipprobeBin() {
  try {
    return path.join(path.dirname(require.resolve('shipprobe/package.json')), 'bin', 'shipprobe.mjs');
  } catch {
    return null;
  }
}

/* One notice line per run, on stderr, so --json output on stdout stays parseable. */
const SHOWN = 'GLANCELESS_NOTICE_SHOWN';
export function notice() {
  if (process.env[SHOWN]) return;
  process.env[SHOWN] = '1';
  process.stderr.write(
    `glanceless ${VERSION} now runs ShipProbe. "glanceless <url>" is "shipprobe page <url>" with glanceless's seven rules: https://shipprobe.thecompound.tech/page\n`,
  );
}

export function shipprobe(args) {
  const bin = shipprobeBin();
  if (!bin || !fs.existsSync(bin)) {
    process.stderr.write('glanceless: the shipprobe package is not installed, so nothing was checked. Run npm install.\n');
    return 2;
  }
  const r = spawnSync(process.execPath, [bin, ...args], { stdio: 'inherit', env: process.env });
  return r.status ?? 2;
}
