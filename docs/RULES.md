# Rules

Each rule opens a real page in headless Chrome, measures something in the rendered DOM, and
reports a finding with a CSS selector and the numbers behind it. Nothing here reads source code,
a stylesheet, or a framework name: every measurement is geometry, computed style, or pixels read
back out of a canvas, so a rule catches the same defect whether it reached the page through a
template, a CMS field, or a hand-written route.

Run `glanceless rules` to print this list from the code itself, with the exact id each one
answers to on `--only` and `--skip`.

## contrast

Text below WCAG 1.4.3, and informational SVG marks below WCAG 1.4.11, measured against the
background that is actually painted behind them rather than the background the element itself
declares. The rule walks every non-transparent ancestor and composites their backgrounds in
paint order, because a transparent cell inside a tinted card inside a dark section resolves to
whatever colour a reader's eye receives, not to the value in that one element's own stylesheet.

A second pass looks inside two-tone glyphs: a plate at partial opacity under a solid mark, which
can pass the ordinary 3:1 floor on each tone individually while the two tones collapse into one
shape at every size an icon is actually drawn.

This rule carries the most defensive code in the package, and each guard exists because an
earlier version of it produced a finding on a page that rendered correctly: a photograph behind
white label text, a closed disclosure panel, a CSS blend mode, a sprite glyph resolving
`currentColor` against the wrong element, a repeated decorative motif, a grid guide, and a
transparent text control layered over a syntax-highlighted copy of the same string. A rule that
invents findings gets switched off, which costs more than the defect it exists to catch.

## dead-column

A run of rows that stops far short of the width the same page establishes elsewhere, while still
starting on that page's own left margin. Two individually reasonable layout decisions produce
this: capping a block's width so a line of prose stays readable, and keeping every block's left
edge on the column the rest of the page shares. Put them together without noticing and a page
uses half of its own established width for hundreds of pixels, with nothing painted in the gap.

There is no fixed number a block is supposed to reach. The reference is the page's own
90th-percentile content edge, so the rule compares a document against itself rather than against
an arbitrary constant. A block that is centred rather than left-aligned is never reported: the
slack is split on both sides, and that reads as a deliberate reading column instead of an
oversight.

## page-chrome

A route that renders without the navigation, the footer, or a link back to the site's own front
page. This happens when a route is added by hand and never wrapped in whatever component carries
the site's shell, and nothing else catches it: the route builds, deploys, and answers 200.

The check has no built-in idea of what a website's chrome should look like. It reads the site's
own home page as the reference and compares every other route against that: does this page carry
at least half of the home page's internal navigation destinations, does it have a footer holding
at least one internal link, and does an anchor anywhere on the page point back at the root.

## figure

A picture is allowed to take a page's full reading width in exactly four shapes: a thin landscape
band (3.5:1 or wider), one column of a two-column section with real prose in the other column, a
background cover with content painted over it, or a capture rendered dense enough that a reader is
meant to study it rather than glance at it. Anything else at the full measure is treated as
decoration sitting at the size of an argument.

Density is measured on the actual pixels: the image is converted to greyscale, downsampled with a
2x box filter to suppress film grain and compression noise, and then scored for edges that survive
in a horizontal run of two or more pixels, which is what a letterform or a UI stroke looks like
and grain does not. A capture that clears the density floor still has to fit one screen: a dense
image forced to an extreme height is a wall regardless of what is printed on it.

An image whose pixels cannot be read (a cross-origin canvas taint, or an image that never
finished loading) is never given the benefit of the doubt. Unknown density is treated as not
dense, so the thin-band rule applies and the finding says why.

## the card-composition rule

One rule targets a single card composition that this design system bans outright on every
surface it ships. It is deliberately not re-described here in visual terms: restating the exact
shape in a public document reads as a specification for producing it rather than a check against
it, and the check exists to make that composition harder to ship by accident, not easier to copy.

Run `glanceless rules` to see this rule's id, its one-line summary, and the file it lives in.
That source file documents the measured thresholds, the two conditions that both have to be true
before it fires, the compositions it explicitly leaves alone, and the incident that led to it
being measured on the rendered page rather than checked in a template.

## table-shape

A `<table>` whose rows are individual facts rather than values that compare against each other
across columns. Three shapes, each measured on the rendered table:

- a row label (`<th scope="row">`) that runs long enough to be a sentence rather than a term a
  reader can scan down a column
- a row whose last cell spans every data column, which makes that row one fact rather than a row
  of comparable values, appropriate for a summary line but not for most of a table's body
- a table with exactly one data column, where nothing is actually compared against anything and
  the markup contributes only a label track squeezing every value into a narrow strip

A `<table>` is a grid a reader scans in two directions. Each of these three shapes renders without
any layout defect: nothing overflows, nothing clips, and every accessibility attribute a table
needs is present. The problem is what the table is being asked to hold.

## noise

The page's own visible text, read out of the browser rather than out of its source, checked
against a fixed list of copy patterns that make a product read as generic. Two families apply to
outward copy:

- performed sincerity: a phrase announcing that the writer is being honest instead of just
  stating the fact ("to be honest," "to be transparent," "honestly")
- filler padding: describing a product with words that would be equally true of a different
  product ("seamlessly," "effortlessly," "powerful," "unlock," "the ultimate," "whether you're X
  or Y," a rhetorical question used as a hook, and any sentence that would still read as true with
  the product's name swapped out)

Code blocks, blockquotes, and short quoted spans are excluded before matching, so a page that
quotes one of these phrases in order to talk about it does not fail for reproducing it. What fails
is the page asserting the phrase in its own voice.

## Exit codes

Every rule, and the run as a whole, uses the same three outcomes:

- **0**, checked and clean
- **1**, checked and something violates a rule
- **2**, could not check: a missing browser, an unreachable page, a route that never rendered, or
  a reference page (for the page-chrome rule) that could not be read

2 never collapses into 0 or 1. A run that could not complete is not a verdict on the page, so it
never reports the code that means the page was measured and found acceptable, and it never reports
the code that means a specific defect was found. Every rule that cannot proceed throws rather than
returning an empty result, because an empty list of findings and a rule that never ran print the
same tick otherwise.
