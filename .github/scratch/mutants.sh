#!/bin/bash
# Mutation check of the pinning tests. Each mutant is one replacement in one source file, applied exactly once, run against
# the tests it is aimed at (vitest -t PATTERN TESTFILE, under TZ=UTC) and undone before the next. Each aim first runs on
# the unbroken code, where it must select at least one test and pass. A mutant is killed only when an aimed test fails; the
# job fails unless every baseline passes and every mutant is killed.
set -u
OUT="$RUNNER_TEMP/vitest.json"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"
bad=0
n=0
declare -A BASELINE

# tally TESTFILE PATTERN: one vitest run of the aimed tests; prints "<failed> <passed>", or "x x" when it wrote no report.
tally() {
  rm -f "$OUT"
  TZ=UTC ./node_modules/.bin/vitest run --reporter=json "--outputFile=$OUT" -t "$2" "$1" >/dev/null 2>>"$RUNNER_TEMP/vitest-stderr.log"
  python3 -I - "$OUT" <<'PY'
import json, sys
try:
    report = json.load(open(sys.argv[1]))
except (OSError, ValueError):
    print("x x")
    sys.exit()
tests = [a for f in report["testResults"] for a in f["assertionResults"]]
print(sum(a["status"] == "failed" for a in tests), sum(a["status"] == "passed" for a in tests))
PY
}

line() { echo "$1" | tee -a "$SUMMARY"; }

# mutant NAME FILE OLD NEW TESTFILE PATTERN: PATTERN (a regex for -t) selects the tests the mutant is aimed at.
mutant() {
  local name=$1 file=$2 old=$3 new=$4 testfile=$5 pattern=$6 failed passed result count
  local key="$testfile|$pattern"
  n=$((n + 1))
  if [ -z "${BASELINE[$key]:-}" ]; then
    read -r failed passed < <(tally "$testfile" "$pattern")
    BASELINE[$key]="$failed failed, $passed passed"
    if [ "$failed" != 0 ] || [ "$passed" = x ] || [ "$passed" = 0 ]; then
      bad=1
      echo "::error::baseline of \"$pattern\" in $testfile: $failed failed, $passed passed"
    fi
  fi
  if ! python3 -I - "$file" "$old" "$new" <<'PY'
import sys
path, old, new = sys.argv[1:4]
text = open(path, encoding="utf-8").read()
if text.count(old) != 1:
    sys.exit(f"the replacement matches {text.count(old)} times")
open(path, "w", encoding="utf-8").write(text.replace(old, new, 1))
PY
  then
    result="NOT APPLIED"
    count="-"
  else
    read -r failed passed < <(tally "$testfile" "$pattern")
    git checkout -q -- "$file"
    if [ "$failed" = x ]; then
      result="INCONCLUSIVE (no report)"
      count="-"
    else
      count="$failed of $((failed + passed))"
      if [ "$failed" -gt 0 ]; then result="killed"; elif [ "$passed" -gt 0 ]; then result="SURVIVED"; else result="INCONCLUSIVE (no test ran)"; fi
    fi
  fi
  [ "$result" = killed ] || bad=1
  line "| $n | $name | \`$file\` | $pattern | $result | $count |"
}

line "## Mutants at $(git log -1 --format=%h -- . ':!.github') (the last commit outside .github: the branch under test)"
line ""
line "| # | Mutant | File | Aimed tests (-t) | Result | Aimed tests failed |"
line "|---|---|---|---|---|---|"

J=src/lib/__tests__/join.test.ts
W=src/lib/__tests__/world-data.test.ts
K=src/lib/__tests__/keys.test.ts

# The first move's order: the point (or the failed track cued again), then play(), then player:start, with nothing awaited.
mutant "play and start reordered" src/components/player/join.ts \
  '  moves.play();
  moves.start();' '  moves.start();
  moves.play();' "$J" "joinMoves"
mutant "play awaited" src/components/player/join.ts \
  'export function joinMoves(from: ResumePoint | null, failed: boolean, moves: JoinMoves): void {
  if (from) moves.goTo(from.index, from.seconds);
  else if (failed) moves.recue();
  moves.play();
  moves.start();
}' 'export async function joinMoves(from: ResumePoint | null, failed: boolean, moves: JoinMoves): Promise<void> {
  if (from) moves.goTo(from.index, from.seconds);
  else if (failed) moves.recue();
  await moves.play();
  moves.start();
}' "$J" "joinMoves"
mutant "a failed source is not cued again" src/components/player/join.ts \
  '  else if (failed) moves.recue();
' '' "$J" "cues the active track again"
mutant "goTo told position zero" src/components/player/join.ts \
  'moves.goTo(from.index, from.seconds)' 'moves.goTo(from.index, 0)' "$J" "goes to the point it is given"

# The world's identifier: the best source's archive identifier, or null where the show has none.
mutant "the identifier is the source's uuid" src/components/world/data.ts \
  'bestSource?.upstreamIdentifier ?? null' 'bestSource?.uuid ?? null' "$W" "best source's archive identifier"
mutant "never an identifier" src/components/world/data.ts \
  'identifier: bestSource?.upstreamIdentifier ?? null,' 'identifier: null,' "$W" "best source's archive identifier"

# The world's single-key rule, the copy of the player's.
mutant "the attribute read as opt-in" public/world/input.js \
  'main?.dataset.singleKey !== "off"' 'main?.dataset.singleKey === "on"' "$K" "the attribute is absent"
mutant "the world's focus does not count" public/world/input.js \
  'main?.dataset.singleKey !== "off" || (e.target instanceof Element && e.target.closest("#world") !== null)' 'main?.dataset.singleKey !== "off"' "$K" "acts inside the world while the attribute is off"

line ""
line "## Baselines (each aim on the unbroken code)"
line ""
while read -r key; do
  line "- \`${key%%|*}\` -t \"${key#*|}\": ${BASELINE[$key]}"
done < <(printf '%s\n' "${!BASELINE[@]}" | sort)
changed=$(git status --porcelain | wc -l)
line ""
line "Tree after the batch: $changed changed files."
[ "$changed" -eq 0 ] || bad=1
exit "$bad"
