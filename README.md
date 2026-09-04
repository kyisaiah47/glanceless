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

Two pages. Both build. Both render. Only one of them was ever looked at.

```
$ npx glanceless demo
```

<!-- GLANCELESS_DEMO_OUTPUT -->

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
