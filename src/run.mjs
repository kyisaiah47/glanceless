/* run.mjs: open every target at every width, run every selected rule, and decide the exit code.
 *
 * THE EXIT CODES, AND THE ONE THAT MATTERS
 *
 *   0  checked, clean
 *   1  checked, and the page violates something
 *   2  COULD NOT CHECK, which never collapses into 0 and never into 1
 *
 * Collapsing 2 into 0 is how a check quietly stops running: a missing browser, a route that never
 * rendered, a reference page that could not be read, all reported as green. Collapsing 2 into 1 is
 * subtler and just as bad: a caller chasing a finding that was really a broken setup learns to
 * distrust the findings.
 *
 * 2 WINS OVER 1 WHEN BOTH HAPPEN, and the findings are still printed. A run that could not complete
 * is not a verdict on the page, so it must not report the code that means "I checked this and here
 * is what is wrong with it". The incomplete part is named in the output, every time.
 *
 * THE PAGE HAS TO HAVE RENDERED BEFORE ANY RULE IS ASKED ANYTHING. `page.goto` resolves an HTTP 500
 * like any other navigation, and a broken page has no images, no tables and almost no text, so
 * every geometry probe returns an empty list and an empty list prints a tick. See src/rendered.mjs
 * for the measurements behind that check.
 */
import { resolveChromium, targetToUrl, openPage, inPage, CannotCheck } from "./browser.mjs";
import { pageRenderFailure } from "./rendered.mjs";
import { selectRules } from "./rules/index.mjs";

export async function runTargets(targets, options = {}) {
  const viewports = options.viewports && options.viewports.length ? options.viewports : [1440];
  const rules = selectRules({ only: options.only, skip: options.skip });

  const pages = [];
  const unchecked = [];
  let chromium;
  try {
    chromium = resolveChromium();
  } catch (e) {
    return { viewports, rules: rules.map((r) => r.id), pages, unchecked: [{ where: "(setup)", why: e.message }], code: 2 };
  }

  const browser = await chromium.launch();
  const cache = {};
  try {
    for (const target of targets) {
      let resolved;
      try {
        resolved = await targetToUrl(target);
      } catch (e) {
        unchecked.push({ where: target, why: e.message });
        continue;
      }
      try {
        for (const viewport of viewports) {
          const row = { target, url: resolved.url, viewport, findings: [], notes: [], unchecked: [] };
          let page;
          let resp;
          try {
            ({ page, resp } = await openPage(browser, resolved.url, viewport));
          } catch (e) {
            const why = `the page could not be opened: ${String(e.message || e).split("\n")[0]}`;
            row.unchecked.push({ rule: "(page)", why });
            unchecked.push({ where: `${resolved.url} @${viewport}`, why });
            pages.push(row);
            continue;
          }
          try {
            const broke = await pageRenderFailure(page, resp, inPage);
            if (broke) {
              row.unchecked.push({ rule: "(page)", why: broke.msg });
              unchecked.push({ where: `${resolved.url} @${viewport}`, why: broke.msg });
              pages.push(row);
              continue;
            }
            const ctx = {
              browser,
              page,
              resp,
              inPage,
              openPage,
              url: resolved.url,
              origin: resolved.origin,
              viewport,
              options,
              cache,
            };
            for (const rule of rules) {
              try {
                const out = await rule.run(ctx);
                for (const f of out.findings || []) row.findings.push({ rule: rule.id, ...f });
                for (const n of out.notes || []) row.notes.push({ rule: rule.id, note: n });
              } catch (e) {
                const why =
                  e instanceof CannotCheck || e.cannotCheck
                    ? String(e.message)
                    : `the rule threw: ${String(e.message || e).split("\n")[0]}`;
                row.unchecked.push({ rule: rule.id, why });
                unchecked.push({ where: `${resolved.url} @${viewport}`, rule: rule.id, why });
              }
            }
          } finally {
            await page.close();
          }
          pages.push(row);
        }
      } finally {
        await resolved.close();
      }
    }
  } finally {
    await browser.close();
  }

  const findings = pages.reduce((n, p) => n + p.findings.length, 0);
  const code = unchecked.length ? 2 : findings ? 1 : 0;
  return { viewports, rules: rules.map((r) => r.id), pages, unchecked, findings, code };
}
