/* rendered.mjs: the page actually rendered, or the run says so instead of ticking.
 *
 * WHY THIS RUNS BEFORE EVERY RULE. `page.goto` does not throw on an HTTP error status. Playwright
 * and Puppeteer both resolve a 500 as a normal navigation, so a gate whose only failure branch is
 * "unreachable" never fires on one. The error page then paints two elements, every geometry probe
 * returns an empty list because there is nothing on the page to measure, and an empty list prints
 * a tick. Two page gates in the estate this package came from shipped that hole on the same day,
 * and it was found by accident: somebody broke a route with a malformed comment mid-run and
 * watched the gate approve it.
 *
 * MEASURED, 2026-09-03, against a throwaway Next 15.5.22 app, headless chromium at 1440x1000:
 *
 *   route                 env    HTTP  html#__next_error__  .next-error-h1  painters  text
 *   /broken               dev    500   yes                  no                     2   142
 *   /broken               prod   500   yes                  no                     2   141
 *   /clientbroken         dev    200   yes                  no                     2   127
 *   /clientbroken         prod   200   yes                  no                     1   127
 *   /nope-does-not-exist  prod   404   no                   YES                    2    33
 *   /fine (healthy)       both   200   no                   no                    17  1378
 *
 * Every row earns a signal the others cannot cover. Status >= 400 is a fact rather than an
 * inference, and it does not catch `/clientbroken`, which is 200 on the wire and broken in the
 * browser. `html#__next_error__` catches every server and client failure in dev and in
 * production, and Next writes that id itself, so it is the framework's own declaration rather
 * than a string somebody guessed. `.next-error-h1` catches the pages-router error page, the one
 * shape the id misses. The dev overlay's dialog lives inside `nextjs-portal`'s shadow root, so a
 * document-level query for it measures false on a page that is showing one, and the host element
 * itself is on every route of every Next dev server including healthy ones, so the host is never
 * the test. Blankness is the backstop for everything that is not Next.
 *
 * SPARSE BECAUSE BROKEN AGAINST SPARSE BECAUSE THAT IS THE PAGE. A painter count cannot tell
 * those apart, and it was tried. A real picture-led section paints exactly two elements, which is
 * what a 500 paints. What separates them is how much of the viewport got ink on it, as a share of
 * one viewport, painting elements only:
 *
 *   NOTHING RENDERED   an empty shell                    0.0%     18 chars
 *                      404                               0.9%     33
 *                      client-side exception, HTTP 200   1.6%    127
 *                      500                               3.1%    141
 *   the gap, 3.1% to 14.3%, with nothing in it
 *   REAL PAGES         a healthy route, 17 painters     14.3%   1378
 *                      a thin band fixture, 2 painters  15.7%    144
 *                      a capture fixture, 2 painters    59.4%    144
 *
 * BLANK_INK is 0.08: two and a half times the worst broken page, and 1.8x under the thinnest real
 * one. BLANK_TEXT is 400: nearly three times the wordiest broken page, under a third of the
 * wordiest thin real one. BOTH have to be under the floor. A picture-led page with almost no
 * prose clears the ink floor on its figure alone; a dense text page with no images clears the text
 * floor. Only a page that put nothing on the screen and said nothing is under both.
 *
 * THREE EXCLUSIONS COME FIRST, and each is something the response itself declares rather than
 * something inferred from how empty the page looks: a non-HTML content type is not a page, a
 * `meta refresh` stub is supposed to be empty, and 204/205 is the HTTP way of saying the same.
 */

export const BLANK_INK = 0.08;
export const BLANK_TEXT = 400;
const DOCUMENT_TYPE = /^\s*(?:text\/html|application\/xhtml\+xml)\b/i;

export function probePageRendered() {
  const REPLACED = new Set(["IMG", "SVG", "CANVAS", "VIDEO", "IFRAME", "INPUT", "TEXTAREA", "SELECT", "BUTTON", "HR"]);
  /* The same definition of "paints" the layout rules use, so the number reported here and the
   * number their own guards act on can never drift apart. An inline <svg> keeps the case it was
   * written in, which is why the tag name is uppercased before the set is asked. */
  const paints = (el) => {
    if (REPLACED.has((el.tagName || "").toUpperCase())) return true;
    for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) return true;
    return false;
  };

  let painters = 0;
  let ink = 0;
  const body = document.body;
  if (body) {
    for (const el of body.querySelectorAll("*")) {
      if (!paints(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      painters++;
      ink += r.width * r.height;
    }
  }
  /* Share of ONE viewport. A run at more than one width would mean a different thing at each of
   * them if this were an absolute pixel figure. */
  const inkShare = +(ink / Math.max(1, innerWidth * innerHeight)).toFixed(4);
  const text = ((body && (body.innerText || body.textContent)) || "").replace(/\s+/g, " ").trim();

  const marks = [];
  if (document.documentElement && document.documentElement.id === "__next_error__") marks.push("html#__next_error__");
  if (document.querySelector(".next-error-h1")) marks.push(".next-error-h1 (next/pages/_error)");
  if (document.querySelector('meta[name="next-error"]')) marks.push("meta[name=next-error]");
  if (document.querySelector("vite-error-overlay")) marks.push("vite-error-overlay");
  for (const host of document.querySelectorAll("nextjs-portal")) {
    const sr = host.shadowRoot;
    if (sr && sr.querySelector("[data-nextjs-dialog], [data-nextjs-dialog-overlay], #nextjs__container_errors_label")) {
      marks.push("nextjs-portal, shadow root, [data-nextjs-dialog]");
      break;
    }
  }
  /* Anchored: only a verdict when the page says almost nothing else. A documentation page that
   * quotes that sentence is a page ABOUT the error, not an instance of it. */
  if (/Application error: a (?:client|server)-side exception has occurred/.test(text) && text.length < 600) {
    marks.push('the framework\'s own "Application error: a ...-side exception has occurred" page');
  }

  return {
    painters,
    inkShare,
    textLen: text.length,
    marks,
    metaRefresh: !!document.querySelector('meta[http-equiv="refresh" i]'),
    head: text.slice(0, 90),
  };
}

/**
 * Returns null when the page rendered, or `{ msg, detail }` when it did not. `resp` is whatever
 * `page.goto` resolved to; a null response is treated as "the status is unknown" rather than as
 * "the status is fine".
 */
export async function pageRenderFailure(page, resp, inPage) {
  const status = resp && typeof resp.status === "function" ? resp.status() : null;
  const headers = resp && typeof resp.headers === "function" ? resp.headers() || {} : {};
  const ctype = String(headers["content-type"] || headers["Content-Type"] || "");

  if (status !== null && status >= 400) {
    return { msg: `HTTP ${status}. The route did not render, so nothing on it was measured.` };
  }
  if (status === 204 || status === 205) return null;
  if (ctype && !DOCUMENT_TYPE.test(ctype)) return null;

  let d;
  try {
    d = await inPage(page, probePageRendered);
  } catch (e) {
    return { msg: `the page could not be inspected: ${String(e.message || e).split("\n")[0]}` };
  }
  if (!d) return { msg: "the page could not be inspected: the probe returned nothing" };

  if (d.marks.length) {
    return {
      msg:
        `an ERROR PAGE is on screen, not the route: ${d.marks.join(" + ")}` +
        (d.head ? `; it reads "${d.head}"` : "") +
        `. HTTP ${status === null ? "(unknown)" : status}, ${d.painters} painting element(s).`,
    };
  }
  if (d.metaRefresh) return null;
  if (d.inkShare < BLANK_INK && d.textLen < BLANK_TEXT) {
    return {
      msg:
        `the document put ink on ${(d.inkShare * 100).toFixed(1)}% of one viewport across ` +
        `${d.painters} painting element(s), and carries ${d.textLen} characters of text ` +
        `(floors ${(BLANK_INK * 100).toFixed(0)}% and ${BLANK_TEXT}). There is no layout here to ` +
        `measure, so a tick would mean "nothing was looked at". It answered HTTP ` +
        `${status === null ? "(unknown)" : status} as ${ctype || "an HTML document"}` +
        (d.head ? `; all it says is "${d.head}"` : "") + ".",
    };
  }
  return null;
}
