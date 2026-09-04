/* contrast.mjs: legibility, including the glyphs.
 *
 * WHAT IT MEASURES
 *   TEXT     WCAG 1.4.3. 4.5:1, or 3:1 for large text (24px or more, or 18.66px or more bold).
 *   GLYPH    WCAG 1.4.11. 3:1 for any SVG carrying meaning. An icon beside a label is not
 *            decoration; it is the thing the eye scans for, which is the entire reason it is
 *            there. `aria-hidden="true"` alone does not exempt it: that marks it as redundant to
 *            a screen reader, and a sighted reader still has to see it. What exempts a glyph is
 *            being inside a link or button whose text already passes, because then the mark is
 *            genuinely ornamental to the control's meaning.
 *   DUOTONE  the two tones inside one two-tone glyph, which the GLYPH rule deliberately does not
 *            look at. A duotone glyph is two paths from one colour, a plate at 50% opacity and a
 *            solid mark, so it can fall apart while the mark passes 3:1 twice over. Two
 *            separation floors, not WCAG thresholds: the plate against the ground at 1.35:1 and
 *            the mark against the plate at 1.25:1.
 *
 * THE BACKGROUND IS THE ONE THAT IS ACTUALLY PAINTED. The walk composites every non-transparent
 * ancestor background over the next, so a cell with `background: transparent` inside a tinted
 * plate inside a dark band resolves to what a reader's eye receives rather than to `rgba(0,0,0,0)`.
 *
 * A GATE THAT INVENTS FINDINGS GETS SWITCHED OFF, WHICH COSTS MORE THAN THE DEFECT IT WAS WRITTEN
 * FOR. Every guard below is here because it was measured producing a fabricated finding on a page
 * that renders correctly, and each one says what was measured and when. Do not delete them to
 * tidy up; they are the argument for the shape of the code.
 */

export const id = "contrast";
export const title = "text and glyph contrast";
export const summary =
  "Text below WCAG 1.4.3, and SVG marks below 1.4.11, measured against the background that is " +
  "actually painted behind them rather than the one the element declares.";

export function probeContrast() {
  /* A COMPUTED COLOUR IS NOT ALWAYS `rgb()`, AND ASSUMING IT WAS REPORTED 1:1 ON GLYPHS THAT
   * RENDER IN TWO PERFECTLY DISTINCT TONES. Chrome serialises a computed colour in the space it
   * was authored in, so a fill written with `oklab()` or resolved through `color-mix()` comes
   * back as `oklab(0.45 0.005 0.09)`, matches an rgb regex nowhere, and returns null. The duotone
   * rules then compare a tone against itself and report a perfect collapse on a glyph that is
   * fine. So the browser resolves it, because the browser is the thing that knows: one 1x1
   * canvas, painted once per distinct string and cached. It accepts every syntax the browser
   * accepts, including the ones that do not exist yet. An unpaintable string leaves the pixel
   * transparent and returns null, which is the honest answer. */
  const _cx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const _seenColor = new Map();
  const parse = (c) => {
    const key = String(c);
    if (_seenColor.has(key)) return _seenColor.get(key);
    let out = null;
    if (key && key !== "none") {
      try {
        _cx.clearRect(0, 0, 1, 1);
        _cx.fillStyle = "#000";
        _cx.fillStyle = key;
        /* An unparseable value leaves fillStyle at the sentinel, which is how this tells "the
         * colour is actually black" from "the browser did not understand it". */
        if (!(_cx.fillStyle === "#000000" && !/^(#0{3,8}|black|rgba?\(0,\s*0,\s*0)/i.test(key.trim()))) {
          _cx.fillRect(0, 0, 1, 1);
          const d = _cx.getImageData(0, 0, 1, 1).data;
          out = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
        }
      } catch {
        out = null;
      }
    }
    _seenColor.set(key, out);
    return out;
  };
  /* SOURCE-OVER HAS TO CARRY ALPHA, and the first version of this did not: it returned `a: 1`
   * from every composite, so a translucent layer was treated as opaque the moment it was mixed.
   * Two stacked 5%-black tints, which is what a table head on a plate is, resolved to
   * rgb(25,25,25) and the head was reported as black on black on pages that render correctly. */
  const over = (fg, bg) => {
    const a = fg.a + bg.a * (1 - fg.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
      g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
      b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
      a,
    };
  };
  const lum = (c) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  /* A PHOTOGRAPH BEHIND THE TEXT IS NOT ALWAYS A `background-image`, AND THE ANCESTOR WALK CANNOT
   * SEE ONE THAT IS NOT. A card that paints its photo with an absolutely positioned <img> sibling
   * has no ancestor background at all: every ancestor is transparent, the walk falls through to
   * the canvas, and white label text over a photograph is reported as white on white at 1:1.
   * Measured 2026-08-22 on a live pricing page: twenty findings across three cards, every price
   * and every feature line, all plainly legible in a screenshot and not one of them real.
   *
   * GEOMETRY, NOT elementsFromPoint. The obvious fix is a hit test and it silently does nothing:
   * elementsFromPoint is viewport-only, and this rule measures a whole page without scrolling, so
   * every element below the fold, which is exactly where those cards sat, returns an empty stack
   * and the fabricated findings survive unchanged. Asked with geometry instead it is
   * viewport-independent. Computed once per page, not once per element. Ancestors are excluded on
   * purpose: an <img> that CONTAINS the text is not behind it. */
  let _grounds = null;
  const imageGrounds = () => {
    if (_grounds) return _grounds;
    _grounds = [];
    for (const n of document.querySelectorAll("img, video, canvas")) {
      const r = n.getBoundingClientRect();
      const cs = getComputedStyle(n);
      if (r.width < 8 || r.height < 8) continue;
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.1) continue;
      _grounds.push({ el: n, left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    }
    return _grounds;
  };

  const ground = (el) => {
    /* BEFORE THE WALK, NOT AFTER IT. The first version of this guard sat on the canvas-fallback
     * path, "only decline if no ancestor background was found", and changed nothing, because the
     * failing case is the opposite one. An ancestor here does carry an opaque white background;
     * the <img> is painted between that ancestor and the text, so the walk finds the white, stops
     * satisfied, and never reaches a fallback. Asking "did the walk fail" cannot detect that.
     * Asking "is there a photograph over this text" can, so it is asked first. */
    {
      const r = el.getBoundingClientRect();
      if (
        r.width > 0 &&
        r.height > 0 &&
        imageGrounds().some(
          (g) => !g.el.contains(el) && r.left < g.right && r.right > g.left && r.top < g.bottom && r.bottom > g.top,
        )
      )
        return null;
    }
    /* THE PAINTED ANCESTRY IS THE FLAT TREE, NOT `parentElement`. Slotted light-DOM content paints
     * inside the shadow tree it was assigned into, so its `parentElement`, the custom element's
     * own child list, is not what is behind it. Measured 2026-08-22 on a component whose receipt
     * lines are ordinary light-DOM nodes handed to a <slot> inside a shadow root with a near-white
     * paper: walking `parentElement` skipped the paper, reached the page's near-black, and
     * reported 12 findings at 1.02 to 1.19:1 on a receipt that renders black on white. */
    const up = (n) => {
      if (n.assignedSlot) return n.assignedSlot;
      const pn = n.parentNode;
      if (pn && pn.nodeType === 11 && pn.host) return pn.host;
      return n.parentElement;
    };
    /* AN ANCESTOR IS ONLY THE GROUND IF ITS BOX IS ACTUALLY BEHIND THE ELEMENT. A box that does
     * not contain the thing it wraps paints nowhere near it, and this walk was crediting it
     * anyway. Measured 2026-08-22 at 1440: a tooltip's pointer triangle sits at y=7267 to 7283
     * and the white plate it belongs to at y=7276 to 7301, so the arrow paints on the page's own
     * near-black. The walk found the plate, called it white on white at 1:1, and reported an
     * invisible mark on a shape drawn exactly where a viewer can see it.
     *
     * The CENTRE POINT, with no tolerance. A box that genuinely wraps something covers its middle
     * by a wide margin, and the case this exists for misses by a single pixel: the triangle's
     * centre is y=7275 and its plate starts at y=7276. A 1px allowance put it back inside and the
     * false finding returned. */
    const ELR = el.getBoundingClientRect();
    const cx = ELR.left + ELR.width / 2;
    const cy = ELR.top + ELR.height / 2;
    const behind = (n) => {
      if (n === el) return true;
      const r = n.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return true;
      return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
    };
    let acc = null;
    for (let n = el; n; n = up(n)) {
      const cs = getComputedStyle(n);
      if (!behind(n)) continue;
      /* `display: contents` GENERATES NO BOX, SO ITS BACKGROUND IS NEVER PAINTED, and
       * getComputedStyle reports it anyway. Measured 2026-08-22: an opaque white body wrapper at
       * `display: contents` inside a near-black page. It paints nothing, the page renders dark and
       * legible, and this walk stopped there and called every line of it light on white. 74
       * findings on one page, all of them from a box that does not exist. */
      if (cs.display === "contents") continue;
      /* AN IMAGE OR GRADIENT IS A GROUND THIS CANNOT READ, SO IT DECLINES TO GUESS. Large areas
       * painted with a gradient or an absolutely positioned layer rather than a background-color
       * are common in exported templates, and compositing the remaining translucent stack over the
       * canvas instead produced those same 74 findings. Returning null skips the element and says
       * so in the run summary. Inventing a colour would put noise in front of every real finding,
       * and a gate people scroll past is a gate that is off. */
      if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
      const c = parse(cs.backgroundColor);
      if (!c || c.a === 0) continue;
      acc = acc ? over(acc, c) : c;
      if (acc.a >= 1) break;
    }
    /* THE CANVAS IS NOT ALWAYS WHITE, AND ASSUMING IT WAS INVENTED 74 FINDINGS ON ONE PAGE. When
     * every ancestor is transparent the browser paints the canvas: html's background, or body's if
     * html has none. */
    const canvasOf = () => {
      for (const n of [document.documentElement, document.body]) {
        const c = n ? parse(getComputedStyle(n).backgroundColor) : null;
        if (c && c.a > 0) return { ...c, a: 1 };
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    if (!acc || acc.a < 1) acc = over(acc ?? { r: 0, g: 0, b: 0, a: 0 }, canvasOf());
    return acc;
  };

  /* AN SVG SPRITE SHEET IS NOT A GLYPH ON THE PAGE, AND IT MEASURED AS TWO. The standard way to
   * ship icon defs is one `<div aria-hidden="true" style="position:absolute;width:0;height:0;
   * overflow:hidden">` holding the `<svg id="...">` bodies that `<use href="#...">` draws
   * elsewhere. Those inner svgs carry `overflow="visible"`, so `getBoundingClientRect()` returns
   * their intrinsic 17x17 even though the 0x0 wrapper clips every pixel away. Measured 2026-08-22
   * at 1440: ten of them, two big enough to clear the 4px floor, both reported at 1.11:1, on a
   * page whose real glyphs were fine.
   *
   * Clipped-to-nothing, not aria-hidden. `aria-hidden` would have been the easy filter and it is
   * the wrong one: exported captures mark almost every decorative svg with it, including the
   * two-tone marks this rule exists to measure. The test is geometric. */
  const clipCache = new WeakMap();
  const clippedAway = (el) => {
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      if (clipCache.has(n)) {
        if (clipCache.get(n)) return true;
        continue;
      }
      const s = getComputedStyle(n);
      /* `display: contents` is excluded, the same trap `ground()` records one function up. It
       * reports an `overflow` and a client box of 0x0 because there is no box: the children lay
       * out as though the element were not there and nothing is clipped by it. Without this clause
       * the test fires on any such wrapper and DELETES findings rather than fabricating them,
       * which is the worse direction. Measured 2026-08-22: a footer credit under a
       * `display: contents; overflow: clip` wrapper, black on near-black at 1.18:1, stopped being
       * reported at all. */
      const hit =
        s.display !== "contents" &&
        (n.clientWidth === 0 || n.clientHeight === 0) &&
        s.overflow !== "visible" &&
        s.display !== "inline" &&
        s.position !== "static";
      clipCache.set(n, hit);
      if (hit) return true;
    }
    return false;
  };

  /* AND A CLIPPING ANCESTOR IS NOT ALWAYS ZERO SIZED. `clippedAway` above only fires on an
   * ancestor whose CLIENT BOX IS 0x0, which is the sprite-sheet shape it was written for. A
   * horizontal carousel is the other shape: a track thousands of pixels wide inside a viewport
   * sized clipper, where the tiles that are not currently on screen are laid out at real
   * coordinates and painted nowhere.
   *
   * Measured on one apex site 2026-09-04 at 1440. Its cover strip lays 43 work tiles on an 8717px
   * row inside a 1440px `overflow: clip` container; `document.scrollWidth` is 1440, so nothing
   * beyond it is reachable. 258 tile captions exist, 14 have their centre inside the viewport and
   * 244 do not. `ground()` correctly declines the strip's own white panel for those 244, because
   * that panel is viewport sized and is genuinely not behind a box at x=1450..1641, so the walk
   * falls through to the canvas `#0a0a0a` and the caption's `#1a1a1a` reports 1.14:1. That
   * produced 240 findings on a page that renders correctly: screenshotted at 1440 the same
   * morning in both colour schemes, the tiles a reader can actually see read `#1a1a1a` on the
   * panel's white in light and white on `#1a1a1a` in dark.
   *
   * 240 fabricated findings is an order of magnitude more than this rule reports against
   * stripe.com, and a rule that cannot be made clean by fixing the page is a rule everyone reads
   * past. The test is geometric and it is the same question `behind()` asks one function up: does
   * this box intersect the box that clips it. If it does not, nothing of it is painted.
   *
   * THE WALK STOPS AT ANY POSITIONED BOX, and that is deliberate. An `absolute` or `fixed`
   * descendant can be painted outside an ancestor's clip when that ancestor is not its containing
   * block, and `sticky` is moved by the scroller. Rather than reimplement containing block
   * resolution and risk DELETING a real finding, this answers "I cannot prove it is clipped" and
   * measures the element. It is allowed to miss a fabrication; it is not allowed to hide a
   * defect. */
  const outsideClip = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.position !== "static" && s.position !== "relative") return false;
      if (n === el || s.display === "contents") continue;
      if (s.overflowX === "visible" && s.overflowY === "visible") continue;
      if (n.clientWidth <= 0 || n.clientHeight <= 0) continue;
      const b = n.getBoundingClientRect();
      /* Touching counts as outside: a box that ends exactly where the clipper begins paints a
         zero width sliver. The half pixel keeps a subpixel layout from reading as an overlap. */
      if (
        r.right <= b.left + 0.5 ||
        r.left >= b.right - 0.5 ||
        r.bottom <= b.top + 0.5 ||
        r.top >= b.bottom - 0.5
      )
        return true;
    }
    return false;
  };

  /* A CLOSED `<details>` STILL LAYS ITS ANSWER OUT, AND EVERY OTHER TEST HERE SAID IT WAS ON
   * SCREEN. Recent Chrome renders closed-details content through `::details-content`: it is laid
   * out and given a real box, and simply never painted. `getBoundingClientRect()` returns 689x210,
   * `display` is block, `visibility` is visible and `opacity` is 1.
   *
   * That alone would only cost a wasted measurement. What made it fabricate findings is that the
   * laid-out box sits BELOW its own `<details>` box, so `ground()` correctly declines to credit
   * the panel behind it and the walk falls through to a translucent hairline over the page
   * ground. Measured 2026-08-22 at 1440: six findings on one page and eight on another, all about
   * paint that never happens. `checkVisibility()` is the browser's own answer to "is this
   * painted", the same reason `parse()` above hands colour strings to a canvas rather than a
   * regex. It returns false here and true for the <summary> beside it. */
  const seen = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (typeof el.checkVisibility === "function" && !el.checkVisibility()) return false;
    return (
      r.width >= 4 &&
      r.height >= 4 &&
      s.visibility !== "hidden" &&
      s.display !== "none" &&
      Number(s.opacity) > 0.05 &&
      !clippedAway(el) &&
      !outsideClip(el)
    );
  };

  /* A `mix-blend-mode` ELEMENT DOES NOT PAINT THE COLOUR IT DECLARES, so its declared colour is
   * not a measurement. It belongs in the same bucket as a ground this rule already refuses to
   * guess at. Measured 2026-08-22 at 390: a header lockup at `<g fill="#FFAE21">` under a
   * `mix-blend-mode: difference` sticky bar, reported at 1.63:1 on rgb(240,240,240). Sampling the
   * actual pixels of that mark in a 2x capture returns rgb(15,66,207), which is the difference
   * blend doing exactly its job, and that measures 6.8:1 on the same ground. The declared value
   * was never on the screen, and the only way to make the page "clean" would be to delete the
   * effect. */
  const blended = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      if (getComputedStyle(n).mixBlendMode !== "normal") return true;
    }
    return false;
  };

  const where = (el) => {
    const bits = [];
    for (let n = el; n && n !== document.body && bits.length < 3; n = n.parentElement) {
      bits.unshift(
        n.tagName.toLowerCase() +
          (n.className && typeof n.className === "string"
            ? "." + n.className.trim().split(/\s+/).slice(0, 2).join(".")
            : ""),
      );
    }
    return bits.join(" > ");
  };

  const out = [];
  let skipped = 0;

  // TEXT, WCAG 1.4.3
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const done = new Set();
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const s = (t.nodeValue || "").trim();
    if (s.length < 3) continue;
    const el = t.parentElement;
    if (!el || done.has(el) || !seen(el)) continue;
    done.add(el);
    const cs = getComputedStyle(el);
    if (el.closest("[aria-hidden=true]")) continue;
    if (blended(el)) {
      skipped++;
      continue;
    }
    /* A TRANSPARENT-INKED EDITOR OVER A HIGHLIGHT LAYER IS NOT UNREADABLE TEXT. IT IS NO TEXT. The
     * syntax-highlight pattern is one construction: a `<textarea>` at `color: transparent` with a
     * visible `caret-color`, sitting on top of a `<pre>` that paints the same string in colour.
     * The reader reads the pre, which this rule measures on its own. The signature has to be all
     * three: a control, alpha-0 ink, and a caret the author kept visible. Alpha-0 ink on its own
     * stays a finding, which is how an invisible label or an invisible glyph gets caught. */
    if (/^(TEXTAREA|INPUT)$/.test(el.tagName)) {
      const ink = parse(cs.color);
      const caret = parse(cs.caretColor);
      if (ink && ink.a === 0 && caret && caret.a > 0) {
        skipped++;
        continue;
      }
    }
    const fg = parse(cs.color);
    if (!fg) continue;
    const bg = ground(el);
    if (!bg) {
      skipped++;
      continue;
    }
    const r = ratio(over(fg, bg), bg);
    const px = parseFloat(cs.fontSize);
    const bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
    const need = px >= 24 || (bold && px >= 18.66) ? 3 : 4.5;
    if (r < need) {
      out.push({
        kind: "text",
        ratio: +r.toFixed(2),
        need,
        px: Math.round(px),
        color: cs.color,
        on: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
        text: s.slice(0, 60),
        sel: where(el),
      });
    }
  }

  // GLYPHS, WCAG 1.4.11

  /* A MOTIF IS NOT A MARK, AND 270 COPIES OF ONE SHAPE IS A MOTIF. WCAG 1.4.11 covers non-text
   * content needed to IDENTIFY a thing, and identification needs distinction: a shape that appears
   * over and over, never beside a word and never inside a control, cannot identify anything,
   * because there is nothing it tells apart. That is a statement about what the shape can do, not
   * a guess about what its author meant.
   *
   * Measured 2026-08-22 at 1440: 144 findings on one page, every one the same sprite id at 1.11:1,
   * a four-point sparkle drawn 394 times, 270 of them at 17x17, in the same ink as the page's
   * rules. It is a corner ornament at the grid intersections and it is meant to be at the edge of
   * visible.
   *
   * FOUR CLAUSES, ALL REQUIRED. Same sprite id, so the geometry is identical by construction
   * rather than by resemblance. At least MOTIF_MIN copies, because one or a few is a mark and this
   * many is a texture. Every copy unlabelled, so a glyph that identifies something anywhere on the
   * page keeps being measured everywhere. Every copy outside a control, which is what keeps a
   * repeated button icon measurable.
   *
   * What this must never swallow is a footer of twenty-one invisible social marks at 1.04:1, the
   * defect this whole block was written for. Those are twenty-one DIFFERENT sprite ids, so no id
   * reaches the threshold and every one is still reported. */
  const MOTIF_MIN = 8;
  const motifIds = (() => {
    const tally = new Map();
    for (const el of document.querySelectorAll("svg")) {
      const u = el.querySelector("use");
      const href = u && (u.getAttribute("href") || u.getAttribute("xlink:href") || "");
      if (!href || !href.startsWith("#")) continue;
      const idv = href.slice(1);
      let rec = tally.get(idv);
      if (!rec) {
        rec = { n: 0, bare: 0 };
        tally.set(idv, rec);
      }
      rec.n++;
      const labelled = (el.parentElement?.innerText || "").trim().length > 0;
      const inControl = Boolean(el.closest("a, button, [role=button], label, summary"));
      if (!labelled && !inControl) rec.bare++;
    }
    const ids = new Set();
    for (const [k, rec] of tally) if (rec.n >= MOTIF_MIN && rec.bare === rec.n) ids.add(k);
    return ids;
  })();
  const isMotif = (el) => {
    const u = el.querySelector("use");
    const href = u && (u.getAttribute("href") || u.getAttribute("xlink:href") || "");
    return Boolean(href && href.startsWith("#") && motifIds.has(href.slice(1)));
  };

  for (const svg of document.querySelectorAll("svg")) {
    if (!seen(svg)) continue;
    if (isMotif(svg)) continue;
    if (blended(svg)) {
      skipped++;
      continue;
    }
    /* Inside a control whose own text passes, the mark is genuinely ornamental FOR CONTRAST. It is
     * a flag rather than a `continue` because the duotone rules below must not inherit the
     * exemption; see the note there. */
    const control = svg.closest("a, button, [role=button]");
    /* THE SAME RATIONALE FOR A MARK WHOSE OWN LABEL SITS BESIDE IT. A graduation mark on a ruler
     * carries nothing its label does not, and that is WCAG 1.4.11's own carve-out: information
     * available through text. GATED ON role="presentation", NOT aria-hidden, and the difference is
     * measured. On one page role="presentation" appears on 30 of 1,185 svgs, 2.5%, so it is an
     * author's deliberate mark rather than a capture default, while aria-hidden is on almost every
     * decorative svg an exporter emits. A text sibling alone is not enough: the attribute has to
     * be there too. */
    const labelledSibling =
      svg.getAttribute("role") === "presentation" &&
      Boolean(svg.parentElement && (svg.parentElement.innerText || "").trim().length > 1);
    const ornamental = Boolean((control && (control.innerText || "").trim().length > 1) || labelledSibling);
    const cs = getComputedStyle(svg);

    /* A GLYPH CAN BE A `<use>` INTO A SPRITE, AND THEN THE SVG HAS NO SHAPES OF ITS OWN.
     * `svg.querySelectorAll("path")` returns nothing, the colour falls through to the svg's
     * inherited text `color`, and the measurement is of a colour that paints nowhere on the page.
     * Measured 2026-08-22 at 1440: an eyebrow's icon reported rgb(0,0,0) on rgb(2,67,100) at
     * 1.99:1 while a 4x crop of the same box shows a white glyph on the navy pill. The paint is
     * `fill="var(--x, rgb(0,0,0))"` on a path inside the sprite, and `--x` is declared on the
     * REFERENCING svg, so the fallback is what the sprite's own computed style resolves.
     *
     * AND A FILL AT `fill-opacity: 0` IS NOT INK. The first path of that same symbol carried
     * `fill-opacity="var(--y, 0)"`, a solid layer the icon set switches off, under the stroked
     * outline that actually draws the glyph. */
    const paints = (el, host) => {
      const es = getComputedStyle(el);
      const fo = el.getAttribute("fill-opacity");
      const o = fo && /^var\(/.test(fo) ? resolveVar(fo, host) : fo ?? es.fillOpacity;
      return !(parseFloat(o) === 0);
    };
    const resolveVar = (v, host) => {
      const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+?)\s*)?\)$/.exec((v || "").trim());
      if (!m) return v;
      const own = getComputedStyle(host).getPropertyValue(m[1]).trim();
      return own || (m[2] ?? "");
    };
    const SHAPES = "path, circle, ellipse, rect, polygon";
    /* A SHAPE INSIDE `<defs>`, `<mask>`, `<clipPath>`, `<pattern>`, `<marker>` OR `<filter>` IS A
     * DEFINITION, NOT PAINT, and measuring one reports a colour that is never on the screen. Same
     * lesson as the sprite-sheet guard above, one level in: there the wrapper was a
     * clipped-to-nothing div, here it is an SVG container the spec says is never rendered.
     *
     * Measured on one brand book 2026-09-04 at 1440: 39 findings, all `rgb(255, 255, 255)` on
     * `rgb(236, 231, 220)` at 1.23:1, across a size ladder of seals and the on-light lockups.
     * Every one of those seals is a knockout: a `<mask>` holds a white `<rect>` and a black
     * `<path>` glyph, and the only shape that paints is `<rect fill="var(--red)">`, masked.
     * `querySelectorAll` reached the mask's white rect first, it carries no `opacity` attribute so
     * it won the `solid` pick, and the rule compared it to the paper plate behind the whole svg. A
     * screenshot of that section shows five red seals per row on cream.
     *
     * The sprite branch gets the same filter with the referenced <symbol> as its root, so the
     * symbol itself is never treated as its own definition wrapper. */
    const DEFS = new Set(["defs", "mask", "clippath", "pattern", "marker", "filter", "symbol"]);
    const isDefinition = (el, root) => {
      for (let n = el.parentElement; n && n !== root; n = n.parentElement) {
        if (DEFS.has((n.tagName || "").toLowerCase())) return true;
      }
      return false;
    };
    let inkShapes = [...svg.querySelectorAll(SHAPES)].filter((e) => !isDefinition(e, svg));
    let sprite = false;
    let spriteRoot = null;
    if (!inkShapes.length) {
      const u = svg.querySelector("use");
      const href = u && (u.getAttribute("href") || u.getAttribute("xlink:href") || "");
      const sym = href && href.startsWith("#") ? document.getElementById(href.slice(1)) : null;
      if (sym) {
        inkShapes = [...sym.querySelectorAll(SHAPES)].filter((e) => !isDefinition(e, sym));
        sprite = true;
        spriteRoot = sym;
      }
    }
    /* A SPRITE SHAPE INHERITS ITS `fill` FROM A WRAPPER, AND `currentColor` INSIDE A <symbol>
     * RESOLVES AGAINST THE REFERENCING SVG, NOT AGAINST THE SYMBOL. A <symbol> is never rendered,
     * so its own computed `color` is the document default, black. Two things follow and both were
     * inventing findings: many icon exports write the paint on a wrapper <g> so the path carries
     * no `fill` at all, and where the attribute is on the path its value is the literal string
     * `currentColor`, whose meaning is the colour of the element that USES it.
     *
     * Measured 2026-08-22 at 1440: a pricing bullet's icon reported rgb(0,0,0) on rgb(28,28,28) at
     * 1.23:1 while a 4x crop of that list item shows a lime mark on near-black. Its referencing
     * svg computes rgb(189,231,78). */
    const spriteFill = (el) => {
      for (let n = el; n && n !== spriteRoot?.parentElement; n = n.parentElement) {
        const a = n.getAttribute && n.getAttribute("fill");
        if (a != null) return a;
      }
      return null;
    };
    const deCurrent = (v) =>
      typeof v === "string" && v.trim().toLowerCase() === "currentcolor" ? getComputedStyle(svg).color : v;
    const drawn = inkShapes.filter((el) => paints(el, svg));
    const solid = drawn.find((el) => !el.hasAttribute("opacity")) ?? drawn[0];
    let raw = cs.color;
    if (solid) {
      const f = sprite
        ? deCurrent(resolveVar(spriteFill(solid) ?? getComputedStyle(solid).fill, svg))
        : getComputedStyle(solid).fill;
      if (f && f !== "none" && f !== "transparent" && !/^rgba?\(0, 0, 0, 0\)$/.test(f)) raw = f;
    }
    /* A DRAWING CAN BE STROKED RATHER THAN FILLED, AND READING ONLY `fill` INVENTS A FINDING EVERY
     * TIME IT IS. `fill: none` with a `stroke` is how every line-drawn mark is built: a hamburger,
     * a hairline rule, a chevron, a connector between two steps. Measured 2026-08-22: a phone
     * header's menu button, three <line> elements at `stroke: rgb(255,255,255); fill: none` inside
     * a black button, reported as rgb(0,0,0) on rgb(0,0,0) at 1:1 because black is what the svg
     * inherits. It renders white on black at 21:1. The same page produced seven more from its
     * template's grid hairlines.
     *
     * THE STROKE IS ONLY CONSULTED WHEN THERE IS NO FILL TO MEASURE, so a filled glyph keeps
     * reporting its fill exactly as before, including every duotone, whose two tones are fills and
     * whose separation checks below depend on that being unchanged. */
    if (raw === cs.color) {
      const spriteAttr = (el, name) => {
        for (let n = el; n && n !== spriteRoot?.parentElement; n = n.parentElement) {
          const a = n.getAttribute && n.getAttribute(name);
          if (a != null) return a;
        }
        return null;
      };
      const strokeOf = (el) =>
        sprite ? deCurrent(resolveVar(spriteAttr(el, "stroke") ?? getComputedStyle(el).stroke, svg)) : getComputedStyle(el).stroke;
      const fillOf = (el) =>
        sprite ? deCurrent(resolveVar(spriteAttr(el, "fill") ?? getComputedStyle(el).fill, svg)) : getComputedStyle(el).fill;
      const strokeShapes =
        inkShapes.length && sprite
          ? inkShapes.concat([...(inkShapes[0].ownerSVGElement?.querySelectorAll("line, polyline") ?? [])])
          : [...svg.querySelectorAll("path, circle, ellipse, rect, polygon, line, polyline")];
      const stroked = strokeShapes.find((el) => {
        const es = getComputedStyle(el);
        const f = fillOf(el);
        const noFill = !f || f === "none" || f === "transparent" || /^rgba?\(0, 0, 0, 0\)$/.test(f) || !paints(el, svg);
        const sk = strokeOf(el);
        return (
          noFill && sk && sk !== "none" && sk !== "transparent" && !/^rgba?\(0, 0, 0, 0\)$/.test(sk) && parseFloat(es.strokeWidth) > 0
        );
      });
      if (stroked) raw = strokeOf(stroked);
      /* AND A RULE IS NOT A MARK. Reading the stroke above is what makes this distinction possible
       * at all: before it, every line-drawn shape reported its inherited text colour and the two
       * were indistinguishable. Nothing scans for a GRID GUIDE. Exported templates draw their
       * layout rules as full-bleed absolutely positioned SVGs at `pointer-events: none` carrying
       * one straight path, computing to a near-invisible grey on white, and they are MEANT to be
       * that faint. Eight of them on one page, every one a finding nobody can act on, standing in
       * front of the real ones.
       *
       * THREE CLAUSES, EACH LOAD-BEARING. The geometry must be an unclosed straight line, only
       * M/L/H/V, no curve command, because every real mark either curves or closes. It must carry
       * no label, because a line beside a word is a mark that word points at. And it must not sit
       * inside a control, which is what keeps a hamburger measured.
       *
       * AND THE GUIDE CAN BE A `<use>` TOO, WHICH MADE THIS EXEMPTION FIRE ON NOTHING. Reading
       * only `svg.querySelectorAll(...)` returns an empty list for a sprite glyph, so `straight`
       * was false and every sprite-drawn grid guide was reported as a failing mark. Measured
       * 2026-08-22 at 1440: six findings at 1.41:1, all referencing one symbol whose entire body
       * is `<path d="M7 0.5v13M0.5 7h13" fill="none" stroke="rgba(0,0,0,0.15)">`. */
      const shapeHost = sprite && spriteRoot ? spriteRoot : svg;
      const shapes = [...shapeHost.querySelectorAll("path, line, polyline, circle, ellipse, rect, polygon")];
      const straight =
        shapes.length > 0 &&
        shapes.every((el) => {
          const t = el.tagName.toLowerCase();
          if (t === "line" || t === "polyline") return true;
          if (t !== "path") return false;
          const d = el.getAttribute("d") || "";
          /* A ZERO-RADIUS ARC IS A STRAIGHT LINE, AND THE SAME GENERATORS EMIT THEM BY THE DOZEN. A
           * rounded-rect guide with a corner radius of 0 is written as
           * `M0.5,0.5 H369.5 A0,0 0 0 1 369.5,0.5 V1768.4`. The arc commands draw nothing.
           * Dropping them is what stops one guide out of twelve reporting while its eleven
           * identical siblings are exempt. Both radii zero only: a real arc keeps its curve and the
           * shape stays measured as the mark it is. */
          const straightened = d.replace(/[Aa]\s*0*(?:\.0+)?[,\s]+0*(?:\.0+)?[,\s]/g, " ");
          /* `Z` is allowed, and only because the curve test is what actually separates the two
           * things: a closed run of straight segments with no fill is a border, not a mark. */
          return d.length > 0 && !/[CcSsQqTt]/.test(straightened) && !/[Aa]/.test(straightened);
        });
      const labelled = (svg.parentElement?.innerText || "").trim().length > 0;
      if (stroked && straight && !labelled && !control) continue;
    }
    const fg = parse(raw) ?? parse(getComputedStyle(svg).color);
    if (!fg) continue;
    const bg = ground(svg.parentElement || svg);
    if (!bg) {
      skipped++;
      continue;
    }
    /* MEASURE THE SOLID TONE, NOT THE PLATE. A two-tone glyph paints a 50%-opacity plate and a
     * solid mark from one `color`. WCAG 1.4.11 asks for the parts needed to IDENTIFY the thing,
     * and that is the solid mark: the plate is a wash and is meant to be lighter. Holding the plate
     * to 3:1 would force every glyph on a site to near-black and delete the accent, which is a
     * different defect. */
    const r = ratio(over(fg, bg), bg);
    const label = (svg.parentElement?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40);
    const onStr = `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`;
    if (r < 3 && !ornamental) {
      out.push({ kind: "glyph", ratio: +r.toFixed(2), need: 3, color: raw, on: onStr, text: label, sel: where(svg) });
    }

    /* THE TWO TONES OF A DUOTONE GLYPH. The rule above measures the solid mark and deliberately
     * skips the plate, for the reason it states. That reasoning is right, and it is also why both
     * of the ways this construction actually breaks sail straight through it.
     *
     *   D1  PLATE AGAINST GROUND. The plate disappears into the background and the glyph loses half
     *       its drawing: an x-mark renders as a solid dot.
     *   D2  MARK AGAINST PLATE. The two tones land within a step of each other and the glyph reads
     *       as one flat blob: a filled circle where a bell should have a clapper, an eye with no
     *       pupil.
     *
     * NEITHER CAN TRIP ON AN UNTOUCHED GLYPH, AND THAT IS THE POINT. A 50% plate lands roughly
     * halfway between the mark and the ground, so the two gaps multiply out to the mark's own
     * ratio: if the mark clears 3:1, the plate cannot also be within 1.35:1 of the ground, and it
     * cannot be within 1.25:1 of the mark. Both rules therefore fire on exactly one thing, a plate
     * some stylesheet has CHANGED, by thinning its opacity or by flattening it to 1. That is why
     * the thresholds can stay this low without producing the noise that gets a gate switched off.
     *
     * NEITHER IS A WCAG THRESHOLD, AND NEITHER SHOULD BE ONE. There is no standard for "can you
     * still tell it is two shapes". These are separation floors, set low on purpose. Set them
     * higher and this becomes the accent-deleting rule the block above correctly refused to write.
     *
     * AND THESE RULES DO NOT TAKE THE ORNAMENTAL EXEMPTION THE CONTRAST RULE TAKES. A mark inside a
     * control whose text already passes is redundant TO MEANING, which is a sound reason to stop
     * holding it to 3:1. It is not a reason to stop noticing that the drawing itself has fallen
     * apart. This mattered from the moment it was written: every glyph in a sidebar sits inside a
     * labelled <a>, so the exemption would make the entire rail invisible to these rules, and the
     * rail is exactly where unreadable duotone icons were first reported. */
    if (r >= 3 || ornamental) {
      /* NOT JUST `path`. Six glyphs in one icon set drew their plate as <circle> or <ellipse>, so
       * counting paths said "fewer than two tones" and skipped them entirely, blind to exactly the
       * glyphs a product then measured at 2.53:1. */
      const paths = [...svg.querySelectorAll("path, circle, ellipse, rect, polygon")];
      /* FIND THE PLATE BY ITS AUTHORED ATTRIBUTE, NOT BY ITS COMPUTED OPACITY. Two-tone sets write
       * `opacity=".5"` on the plate path in the markup. The first version of this looked for a
       * COMPUTED opacity between .05 and .95, which skips the single most important case, because
       * the way this construction actually breaks is a stylesheet forcing BOTH paths to opacity 1.
       * Under that finder the flattened glyph has no plate, nothing is measured, and the gate
       * reports clean on the defect it was written for. The attribute says "this glyph was DRAWN as
       * two tones". What the computed opacity says is whether it still is, which is the question,
       * not the filter. A single-path glyph never carries the attribute and has no second tone to
       * lose. */
      const plate = paths.length > 1 ? paths.find((el) => el.hasAttribute("opacity")) : null;
      if (plate) {
        /* READ THE COMPUTED FILL, NOT THE `fill` ATTRIBUTE. The attribute is usually
         * "currentColor", so reading it and falling back to the mark's colour says every plate is
         * the same colour as its mark, which reports 1:1 on glyphs that render as two perfectly
         * distinct tones. A register that replaces the opacity construction outright, forcing both
         * paths opaque and assigning two explicit colours, is a legitimate two-tone scheme and this
         * rule must not call it a collapse. What is being measured is what the browser PAINTS. */
        const pcs = getComputedStyle(plate);
        const po = Number(pcs.opacity);
        const pc = parse(pcs.fill) ?? fg;
        const plated = over({ ...pc, a: (pc.a ?? 1) * po }, bg);
        const vsGround = ratio(plated, bg);
        const vsMark = ratio(over(fg, bg), plated);
        if (po >= 0.95 && vsMark < 1.05) {
          /* Drawn as two tones, painting as one. Reported separately because the fix is different:
           * the others want a colour moved, this one wants an override removed. */
          out.push({
            kind: "duotone-tones",
            ratio: +vsMark.toFixed(2),
            need: 1.25,
            color: raw,
            on: onStr,
            text: label,
            sel: where(svg),
            note: "the plate's opacity is overridden to 1, so the glyph is drawn as two tones and paints as one solid shape",
          });
        } else if (vsGround < 1.35) {
          out.push({
            kind: "duotone-plate",
            ratio: +vsGround.toFixed(2),
            need: 1.35,
            color: raw,
            on: onStr,
            text: label,
            sel: where(svg),
            note: "the plate half of the glyph is not separated from the ground, so it paints nothing",
          });
        } else if (vsMark < 1.25) {
          out.push({
            kind: "duotone-tones",
            ratio: +vsMark.toFixed(2),
            need: 1.25,
            color: raw,
            on: onStr,
            text: label,
            sel: where(svg),
            note: "the two tones are within a step of each other, so the glyph reads as one blob",
          });
        }
      }
    }
  }
  return { findings: out, skipped };
}

const KIND = {
  text: "text below WCAG 1.4.3",
  glyph: "glyph below WCAG 1.4.11",
  "duotone-plate": "duotone plate lost in the ground",
  "duotone-tones": "duotone tones collapsed",
};

export async function run({ page, inPage }) {
  const { findings, skipped } = await inPage(page, probeContrast);
  const notes = [];
  if (skipped) {
    notes.push(
      `${skipped} element(s) were not measured: their ground is an image, a gradient or a blend, ` +
        `so the colour a reader receives is not readable from the DOM. That is said out loud rather ` +
        `than guessed at.`,
    );
  }
  return {
    findings: findings.map((f) => ({
      sel: f.sel,
      msg:
        `${KIND[f.kind] || f.kind}: ${f.ratio}:1 against ${f.need}:1` +
        (f.px ? ` at ${f.px}px` : "") +
        `. ${f.color} on ${f.on}.` +
        (f.note ? ` ${f.note}.` : "") +
        (f.text ? ` "${f.text}"` : ""),
      measured: { kind: f.kind, ratio: f.ratio, need: f.need, px: f.px, color: f.color, on: f.on, text: f.text },
    })),
    notes,
  };
}
