/* browser.mjs: the real browser, and the two things every rule here needs from it.
 *
 * 1. PLAYWRIGHT IS RESOLVED AT RUN TIME AND ITS ABSENCE IS EXIT 2, NEVER A PASS. An optional
 *    dependency that reports "skipped, all good" when it is missing is the same defect as a check
 *    that cannot see anything: in the output it is indistinguishable from a check that found
 *    nothing wrong. "I could not check" and "I checked and it was fine" are different answers.
 *
 * 2. A LOCAL FILE IS SERVED OVER HTTP, NOT OPENED AS file://. Chromium treats a file:// image as
 *    cross-origin, so `getImageData` throws on it and the figure rule's density measurement
 *    reports "the pixels could not be read" for every picture on the page. That is the rule's
 *    fail-closed path, not its rule, so a local run over file:// would exercise only the error
 *    branch and prove nothing. The directory holding the file is served on an ephemeral port,
 *    which also gives the page an origin, so relative links and a sibling index.html behave the
 *    way they do in production.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export class CannotCheck extends Error {}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

/** Resolve playwright from the caller's tree first, then from this package's own. */
export function resolveChromium() {
  const tries = [
    () => createRequire(path.join(process.cwd(), "package.json"))("playwright"),
    () => createRequire(import.meta.url)("playwright"),
    () => createRequire(path.join(process.cwd(), "package.json"))("playwright-core"),
    () => createRequire(import.meta.url)("playwright-core"),
  ];
  let last = null;
  for (const t of tries) {
    try {
      const pw = t();
      if (pw && pw.chromium) return pw.chromium;
    } catch (e) {
      last = e;
    }
  }
  throw new CannotCheck(
    "playwright is not installed, so no page could be opened and nothing was measured.\n" +
      "    npm i -D playwright && npx playwright install chromium\n" +
      "    A missing browser is exit 2, could not check. It is never reported as clean.\n" +
      (last ? `    last resolver error: ${String(last.message).split("\n")[0]}` : ""),
  );
}

/** Serve `dir` on an ephemeral loopback port. Returns { origin, close }. */
export async function serveDir(dir) {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    let p;
    try {
      p = decodeURIComponent(String(req.url).split("?")[0]);
    } catch {
      res.writeHead(400);
      return res.end();
    }
    let file = path.join(root, path.normalize(p).replace(/^(\.\.[/\\])+/, ""));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      return res.end();
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      return res.end("<!doctype html><title>404</title><h1>404</h1>");
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((r) => server.close(r)),
  };
}

/**
 * Turn one CLI target into { url, origin, close }. A URL passes through. A path on disk gets a
 * server rooted at its directory, and the returned `close` shuts that server down.
 */
export async function targetToUrl(target) {
  if (/^https?:\/\//i.test(target)) {
    const u = new URL(target);
    return { url: u.href, origin: u.origin, close: async () => {} };
  }
  if (/^file:\/\//i.test(target)) {
    const f = new URL(target);
    return targetToUrl(path.normalize(decodeURIComponent(f.pathname)));
  }
  const abs = path.resolve(target);
  if (!fs.existsSync(abs)) {
    throw new CannotCheck(`no such file or directory: ${target} (and it is not an http:// URL)`);
  }
  const isDir = fs.statSync(abs).isDirectory();
  const dir = isDir ? abs : path.dirname(abs);
  const served = await serveDir(dir);
  const url = isDir ? `${served.origin}/` : `${served.origin}/${encodeURIComponent(path.basename(abs))}`;
  return { url, origin: served.origin, close: served.close, servedFrom: dir, localPath: pathToFileURL(abs).href };
}

/**
 * Open a page and put it in the state every rule expects to measure: images eagerly loaded and
 * decoded, one scroll pass done, and scrolled back to the top.
 *
 * EVERY IMAGE IS FORCED TO LOAD BEFORE ANYTHING IS MEASURED. `loading="lazy"` below the fold
 * leaves `naturalWidth` at 0, and an unread image reports "density unknown", which turns a correct
 * capture into a finding about the loader rather than about the page.
 */
export async function openPage(browser, url, viewport) {
  const page = await browser.newPage({ viewport: { width: viewport, height: 1000 } });
  const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    for (const i of document.querySelectorAll("img")) {
      i.loading = "eager";
      i.decoding = "sync";
    }
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo(0, 0);
    await Promise.all([...document.querySelectorAll("img")].map((i) => i.decode().catch(() => {})));
  });
  await page.waitForTimeout(400);
  return { page, resp };
}

/** Run an in-page probe by stringifying it, so it closes over nothing on this side. */
export function inPage(page, fn, ...args) {
  const body = fn.toString().replace(/^export\s+/, "");
  const call = args.map((a) => JSON.stringify(a)).join(", ");
  return page.evaluate(`(async () => { ${body} return await ${fn.name}(${call}); })()`);
}
