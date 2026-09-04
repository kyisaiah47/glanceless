/* The rule registry. Order is the order findings are printed in.
 *
 * (The rule named here as `stat-eyebrow` is the no-stat-eyebrow check: it refuses that register
 * rather than producing it. See src/rules/stat-eyebrow.mjs for what it measures and why.)
 *
 * A rule module exports `id`, `title`, `summary` and `run(ctx)`. `run` returns
 * `{ findings, notes }`, where a finding is `{ sel, msg, measured }`. To refuse to run rather than
 * to pass, a rule throws `CannotCheck`, which is exit 2 and never collapses into 0 or 1.
 *
 * THERE IS NO PLUGIN LOADER AND NO CONFIG FILE OF RULES TO DISABLE. `--skip` is on the command
 * line, where it is visible in the log of the run that used it, rather than in a checked-in file
 * where it becomes permanent and nobody remembers what it is covering.
 */
import * as contrast from "./contrast.mjs";
import * as deadColumn from "./dead-column.mjs";
import * as pageChrome from "./page-chrome.mjs";
import * as figure from "./figure.mjs";
import * as statEyebrow from "./stat-eyebrow.mjs";
import * as tableShape from "./table-shape.mjs";
import * as noise from "./noise.mjs";

export const RULES = [contrast, deadColumn, pageChrome, figure, statEyebrow, tableShape, noise];
export const RULE_IDS = RULES.map((r) => r.id);

export function selectRules({ only = null, skip = null } = {}) {
  const bad = [];
  const known = new Set(RULE_IDS);
  for (const n of [...(only || []), ...(skip || [])]) if (!known.has(n)) bad.push(n);
  if (bad.length) {
    /* AN UNKNOWN RULE NAME FAILS RATHER THAN BEING IGNORED. A typo in `--only` that silently
     * selected nothing, or a typo in `--skip` that silently skipped nothing, is a run whose scope
     * is not what the caller asked for and whose exit code says it is. */
    const e = new Error(`unknown rule name(s): ${bad.join(", ")}. Known: ${RULE_IDS.join(", ")}`);
    e.cannotCheck = true;
    throw e;
  }
  let out = RULES;
  if (only && only.length) out = out.filter((r) => only.includes(r.id));
  if (skip && skip.length) out = out.filter((r) => !skip.includes(r.id));
  if (!out.length) {
    const e = new Error("no rules selected, so nothing would be checked. Zero checks run is not a pass.");
    e.cannotCheck = true;
    throw e;
  }
  return out;
}
