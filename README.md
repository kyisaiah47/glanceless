# glanceless

[![gates](https://github.com/kyisaiah47/glanceless/actions/workflows/ci.yml/badge.svg)](https://github.com/kyisaiah47/glanceless/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/glanceless.svg)](https://www.npmjs.com/package/glanceless)
[![licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)

**Page-level design rules, measured in a real browser, that fail closed.** Contrast, dead
columns, page chrome, full-column figures, one banned card composition, table shape, and copy
noise, all read off the rendered DOM rather than the source that produced it.

There is no `--force`, no allowlist and no known-issues file. Each of those is a supported way to
record a failure and ship past it, which is exactly the behaviour these rules exist to make
impossible.

```
npx glanceless demo
```

## The thing this is actually about

Most design review happens by looking at a page and deciding it looks fine. That works until the
defect is one a glance does not catch: a paragraph set in grey that measures 2:1 against white,
which reads as an intentional muted tone and fails WCAG by more than half. A route added by hand
that renders perfectly and carries no way back to the site. A picture sized to the full column
that is a decorative render rather than something worth studying, sitting beside a matching
picture that is a dense interface capture and does earn that width, the two indistinguishable by
aspect ratio alone. A comparison table whose rows are actually just facts, which renders with no
layout defect at all because nothing about a wide cell is technically wrong.

Every one of these builds, deploys, and answers 200. Nothing overflows, nothing clips, no
console error fires. A human looking at the page is the only thing that ever caught any of them,
and that is the condition this tool exists to end: measure the same things a careful reviewer
would look for, in a real browser, on every page, every time, and refuse to report a finding as
merely worth mentioning.

## What it looks like

Two pages. Both build. Both render. Only one of them was ever looked at. This is the real,
unedited output of running the bundled demo, with one line marked below: the demo also runs the
card-composition rule described in [docs/RULES.md](docs/RULES.md), and its id and finding text
are elided from this block rather than reproduced here, for the same reason that rule's own
paragraph in that document does not restate its banned shape.

```
$ npx glanceless demo
glanceless demo: two pages. Both build. Both render. One of them was not looked at.

--- test/fixtures/clean.html
ok  http://127.0.0.1:54398/clean.html @1440px

1 page view(s) at 1440px, rules: contrast, dead-column, figure, [elided, see note above], table-shape, noise. 0 finding(s), 0 could not be checked.

--- test/fixtures/dirty.html

X   http://127.0.0.1:54402/dirty.html @1440px
    contrast (text and glyph contrast): 1 finding(s)
      main > p.faint
        text below WCAG 1.4.3: 2.1:1 against 4.5:1 at 16px. rgb(179, 179, 179) on rgb(255, 255, 255).
        "This paragraph is set in a grey that measures about two to o"
    dead-column (dead column): 1 finding(s)
      p
        452px of the page's own 1072px measure is unused beside 440px of content starting at y=256. This
        block uses 58% of the width the same page establishes elsewhere, and 20% of the page's content
        rows stop short of it. "The measurement is the page against itself. Ther"
    figure (full-column figure): 1 finding(s)
      img
        fills 100% of main at 1072x715 (aspect 1.5:1, column 1072px). only 0.93% glyph-scale structure.
        This is a render or a photograph, not something to read (floor 8%). figure-render.png
    [elided, see note above]: 1 finding(s)
      div.fig
        (a real finding printed here when you run the demo yourself; see docs/RULES.md)
    table-shape (table shape): 2 finding(s)
      th
        [rule B] row label is 93 characters, over 64. A label column the reader cannot scan is not a
        label column. "A row label that is a whole sentence written for a data file rather than for a
        reader to scan". Fix: author a two to four word term on the row and move the sentence into the
        cell it belongs to
      tr
        [rule C] row spans every data column (colspan=3 of 4). One value across the whole grid is a
        FACT, not a comparison. "One value stretched across every data column, which is a fact and not a
        comparison, and a comparison table is the worst ". Fix: move it out of the table into a label
        and value list; leave the table to rows that actually differ by column
    noise (copy noise): 3 finding(s)
      p
        FILLER NOISE IN PRODUCT COPY (designed-to): "Designed to help" in "Designed to help teams
        seamlessly streamline their filings and unlock powerful insights.". Fix: say what it does, not
        what it was designed to do
      p
        FILLER NOISE IN PRODUCT COPY (puff-adjective): "seamlessly" in "Designed to help teams
        seamlessly streamline their filings and unlock powerful insights.". Fix: delete the adjective; a
        product that does the thing does not need it
      p
        FILLER NOISE IN PRODUCT COPY (puff-verb): "streamline their" in "Designed to help teams
        seamlessly streamline their filings and unlock powerful insights.". Fix: name the concrete
        action instead of the verb that means nothing

1 page view(s) at 1440px, rules: contrast, dead-column, figure, [elided, see note above], table-shape, noise. 9 finding(s), 0 could not be checked.

Nothing here ships. Fix the page, or change the rule in the open and say why.
There is no --force, no allowlist and no known-issues file.

demo: the clean page exits 0 and the failing page exits 1. That is the whole product.
```

## Install

```sh
npx glanceless demo                    # no install, runs the example above
npm i -D glanceless playwright         # in a project
npx playwright install chromium
```

Node 18+. Playwright is an optional peer dependency, resolved at run time. A missing browser is
exit 2, could not check. It is never reported as clean.

## Usage

```sh
glanceless <url|file|dir> [<url|file|dir> ...]

  --only <ids>     run only these rules, comma separated
  --skip <ids>     run every rule except these
  --vw <widths>    viewport widths, comma separated (default 1440)
  --home <url>     the front page the page-chrome rule compares routes against
  --sitemap        read the origin's sitemap.xml and add one interior route per
                   distinct first path segment
  --routes <n>     how many routes --sitemap may add per origin (default 6)
  --json           machine-readable output
  --quiet          only print findings

glanceless rules                       list every rule, its id, and its summary
glanceless demo                        the bundled fixtures: one clean, one failing
```

A local file or directory is served over HTTP on an ephemeral loopback port rather than opened as
`file://`, because a `file://` image is treated as cross-origin by Chromium and the figure rule's
pixel density measurement would report every picture on the page as unreadable.

## The rules

Full detail, thresholds, and the incidents that produced each one: **[docs/RULES.md](docs/RULES.md)**.

| id | what it measures |
|---|---|
| `contrast` | text below WCAG 1.4.3, and informational SVG marks below WCAG 1.4.11, against the background actually painted behind them |
| `dead-column` | a run of rows that stops far short of the width the same page establishes elsewhere |
| `page-chrome` | a route rendering without the nav, footer, or a link home that the site's own front page carries |
| `figure` | a picture at the full reading column that is not a thin band, one side of a two-column layout, a background cover, or dense enough to study |
| (see `glanceless rules`) | a card composition banned elsewhere in this design system: see [docs/RULES.md](docs/RULES.md#the-card-composition-rule) rather than this table |
| `table-shape` | a `<table>` whose rows are individual facts rather than values that compare across columns |
| `noise` | performed sincerity and filler padding in the page's own visible copy |

Each rule reads the rendered page, not the framework, the stylesheet, or the source that produced
it, so the same defect is caught whether it reached the page through a template, a CMS field, or
a hand-written route.

## Exit codes

| | |
|---|---|
| `0` | checked, clean |
| `1` | checked, and the page violates something |
| `2` | could not check |

`2` never collapses into `0`, and never into `1`. A missing browser, an unreachable page, a route
that never rendered, or a reference page the `page-chrome` rule could not read are all exit 2. "I
could not check" and "I checked and it was fine" are different answers, and a run that reports
them the same way teaches its caller to stop trusting either one.

## Running the tests

```sh
git clone https://github.com/kyisaiah47/glanceless && cd glanceless
npm i -D playwright && npx playwright install chromium
bash test/run.sh
```

Every fixture in `test/fixtures/` is pinned to a comment explaining what it tests and why it is
shaped the way it is, including the exact regressions each rule was measured against on real
pages before its thresholds were set.

## Honest limitations

- **Needs a real Chromium.** Playwright plus a downloaded browser binary, which is real disk and
  real seconds per page. There is no lightweight fallback, because a lighter check is exactly how
  the defects this tool exists for slip through in the first place.
- **The rules are the ones this design system needed.** They cover contrast, layout width,
  chrome, figures, one banned composition, tables, and copy noise, not the full space of
  accessibility or design review. Nothing here replaces a manual review; it removes the class of
  defect that a manual review reliably misses because it renders correctly.
- **`noise` is a fixed phrase list**, not a language model. It catches the patterns it was given
  and nothing it was not, and quoting one of its phrases to talk about it (in a fenced block, a
  quoted span, or a blockquote) is deliberately excluded from matching.
- **`page-chrome` needs a reachable home page.** If the site's front page cannot be read, the rule
  exits 2 rather than skipping, and says which URL it tried.

## Why it is called glanceless

Every defect this tool measures is one that a glance at the rendered page does not catch: a
colour that reads as a deliberate muted tone and fails contrast by half, a table that looks
completely normal and holds no comparison, a picture that fills its column and is indistinguishable
from a correct one until its pixels are actually read. The tool exists to replace the glance with
a measurement, which is the whole name.

## License

MIT. See [LICENSE](LICENSE).

---

Built by [Kynth Studios](https://kynth.studio).
