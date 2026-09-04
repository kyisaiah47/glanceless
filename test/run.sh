#!/bin/bash
# run.sh: the whole suite, against the bundled fixtures in test/fixtures.
#
#   bash test/run.sh
#
# Every fixture is pinned to a comment inside test/fixtures/*.html explaining exactly what it is
# testing and why it is shaped the way it is. A rule with a passing suite and a page that still
# slips through has a real bug. A rule that flags one of the PASS fixtures has fabricated a
# finding, which costs more than the defect it exists to catch: a check that invents findings on
# correct pages gets switched off, and then it catches nothing at all.
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
CLI="node bin/glanceless.mjs"
FIX=test/fixtures

PASS=0; FAIL=0
ok()  { echo "  ok    $1"; PASS=$((PASS+1)); }
bad() { echo "  FAIL  $1"; FAIL=$((FAIL+1)); }
exits() {
  local label=$1 want=$2; shift 2
  local out; out=$(mktemp "${TMPDIR:-/tmp}/glanceless-test.XXXXXX")
  "$@" >"$out" 2>&1
  local got=$?
  if [ "$got" = "$want" ]; then
    ok "$label"
  else
    bad "$label (exit $got, want $want)"
    sed 's/^/         /' "$out"
  fi
  rm -f "$out"
}

echo "== cli =="
exits "no target is exit 2, not a silent no-op"       2 $CLI
exits "--help exits 0"                                 0 $CLI --help
exits "--version exits 0"                              0 $CLI --version
exits "rules exits 0"                                  0 $CLI rules
exits "an unknown --only rule name is exit 2"          2 $CLI $FIX/clean.html --only nope
exits "a missing file is exit 2, could not check"      2 $CLI $FIX/does-not-exist.html

echo "== demo (the README's first command) =="
exits "the bundled demo is honest: clean 0, dirty 1"   0 $CLI demo

echo "== contrast: WCAG 1.4.3 text, 1.4.11 glyphs, duotone separation =="
exits "every guard clears, nothing fires"              0 $CLI $FIX/contrast-guards.html --only contrast
exits "an invisible mark and a collapsed duotone fail" 1 $CLI $FIX/contrast-fail.html --only contrast

echo "== figure: the four allowed forms of a full-column picture =="
exits "a thin landscape band passes"                   0 $CLI $FIX/figure-band.html --only figure
exits "a dense capture earns the column"               0 $CLI $FIX/figure-capture.html --only figure
exits "a background cover is not a figure"             0 $CLI $FIX/figure-hero.html --only figure
exits "one column of two, prose beside it, passes"     0 $CLI $FIX/figure-twocol.html --only figure
exits "a tile inside a scrolling row is not a column"  0 $CLI $FIX/figure-tile.html --only figure
exits "a render at the full measure fails"             1 $CLI $FIX/figure-render.html --only figure
exits "dense but too tall to study in one screen"      1 $CLI $FIX/figure-tall.html --only figure
exits "a picture that exactly fills its column fails"  1 $CLI $FIX/figure-exactcol.html --only figure

echo "== dead-column: the page's own content edge is the reference =="
exits "clean page uses its own width throughout"       0 $CLI $FIX/clean.html --only dead-column
exits "dirty page: prose stops at half the measure"    1 $CLI $FIX/dirty.html --only dead-column

# One rule id is resolved by its title rather than typed literally here, because the id itself is
# the name of a banned visual register and this file is prose about tests, not the place to spell
# it out. The rule module is the source of truth; see its own file for the full measurement.
SURFACE_RULE=$(node --input-type=module -e "
  import('./src/rules/index.mjs').then((m) => {
    const r = m.RULES.find((x) => x.title.includes('tracked label'));
    process.stdout.write(r.id);
  });
")
echo "== $SURFACE_RULE: a dominant numeral paired with a small tracked caption =="
exits "clean page: the number sits inside a sentence"  0 $CLI $FIX/clean.html --only $SURFACE_RULE
exits "dirty page: the negative fixture card fires"    1 $CLI $FIX/dirty.html --only $SURFACE_RULE

echo "== table-shape: a grid to scan, not a container for facts =="
exits "clean page: three rows compare across columns"  0 $CLI $FIX/clean.html --only table-shape
exits "dirty page: a sentence label and a spanning row" 1 $CLI $FIX/dirty.html --only table-shape

echo "== noise: the four copy families, read off the rendered page =="
exits "clean page: copy says what the tool does"       0 $CLI $FIX/clean.html --only noise
exits "dirty page: copy that fits any other product"   1 $CLI $FIX/dirty.html --only noise

echo "== page-chrome: measured against the site's own front page =="
exits "clean page wears the front page's nav and footer" 0 $CLI $FIX/clean.html --only page-chrome
exits "dirty page has no nav, no footer, no way home"     1 $CLI $FIX/dirty.html --only page-chrome

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
