/* The library entry point. Everything the CLI does is available here.
 *
 *   import { runTargets, printReport, RULES } from "glanceless";
 *   const result = await runTargets(["https://example.com/"], { viewports: [1440, 1120] });
 *   process.exit(printReport(result));
 *
 * `runTargets` never throws for a page it could not measure: it records that under `unchecked`
 * and returns exit code 2, so a caller cannot accidentally read a broken run as a clean one.
 */
export { runTargets } from "./run.mjs";
export { printReport } from "./report.mjs";
export { RULES, RULE_IDS, selectRules } from "./rules/index.mjs";
export { CannotCheck, resolveChromium, targetToUrl, openPage, inPage, serveDir } from "./browser.mjs";
export { pageRenderFailure, probePageRendered, BLANK_INK, BLANK_TEXT } from "./rendered.mjs";
export { noiseIssues, noiseIssue, proseOf, PATTERNS, FAMILIES, RULE, COPY_RULE, patternsFor } from "./noise.mjs";
