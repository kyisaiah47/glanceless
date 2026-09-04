/* report.mjs: what a run prints.
 *
 * EVERY FINDING NAMES THE ELEMENT AND THE MEASUREMENT. A rule that says "contrast is low" cannot be
 * acted on. A rule that says which selector, what ratio it measured, what ratio it needed, and what
 * colour on what ground can be fixed by somebody who was not there when it fired.
 */
import { RULES } from "./rules/index.mjs";

const TITLE = Object.fromEntries(RULES.map((r) => [r.id, r.title]));

export function printReport(result, { quiet = false, log = console.log } = {}) {
  const { pages, unchecked, viewports } = result;

  for (const p of pages) {
    if (!p.findings.length && !p.unchecked.length) {
      if (!quiet) log(`ok  ${p.url} @${p.viewport}px`);
      continue;
    }
    if (p.findings.length) log(`\nX   ${p.url} @${p.viewport}px`);
    const byRule = new Map();
    for (const f of p.findings) {
      if (!byRule.has(f.rule)) byRule.set(f.rule, []);
      byRule.get(f.rule).push(f);
    }
    for (const [rule, list] of byRule) {
      log(`    ${rule} (${TITLE[rule] || rule}): ${list.length} finding(s)`);
      for (const f of list) {
        log(`      ${f.sel}`);
        for (const line of wrap(f.msg, 96)) log(`        ${line}`);
      }
    }
    for (const u of p.unchecked) {
      log(`\n?   ${p.url} @${p.viewport}px  COULD NOT CHECK  [${u.rule}]`);
      for (const line of wrap(u.why, 96)) log(`      ${line}`);
    }
    if (!quiet) {
      for (const n of p.notes) for (const line of wrap(`note [${n.rule}] ${n.note}`, 96)) log(`      ${line}`);
    }
  }

  const total = pages.reduce((n, p) => n + p.findings.length, 0);
  const measured = pages.length;
  log("");
  log(
    `${measured} page view(s) at ${viewports.join("/")}px, rules: ${result.rules.join(", ")}. ` +
      `${total} finding(s), ${unchecked.length} could not be checked.`,
  );

  if (unchecked.length) {
    log("");
    log("THIS RUN IS NOT A VERDICT. Something could not be checked, and could-not-check is never");
    log("reported as clean. Exit code 2.");
    for (const u of unchecked) log(`  ${u.where}${u.rule ? ` [${u.rule}]` : ""}: ${firstLine(u.why)}`);
  } else if (total) {
    log("");
    log("Nothing here ships. Fix the page, or change the rule in the open and say why.");
    log("There is no --force, no allowlist and no known-issues file.");
  }
  return result.code;
}

export function firstLine(s) {
  return String(s).split("\n")[0];
}

export function wrap(s, width) {
  const words = String(s).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    if (line && line.length + 1 + w.length > width) {
      lines.push(line);
      line = w;
    } else {
      line = line ? `${line} ${w}` : w;
    }
  }
  if (line) lines.push(line);
  return lines;
}
