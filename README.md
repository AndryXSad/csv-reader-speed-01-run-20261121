# csv-reader-speed — a faster drop-in for csv-reader 1.0.0

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/AndryXSad/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/AndryXSad/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

Entry for the [make.fun bounty "Read broken CSV files faster"](https://make.fun/bounty/csv-reader-speed-01-run-20261121): a dependency-free ES module (`solve.js`) whose `run(input)` returns exactly what csv-reader 1.0.0 returns for every case — `{columns, rows, errors}` — including its broken-row policy (BOM, blank lines, stray CRs, unterminated quotes, quote junk, short/long rows).

## How it is fast

The reference builds every field a character at a time. This reader cuts
fields out with `indexOf`/`slice` instead: the common case — an unquoted
field with no CR in it — is a single slice, and a quoted field is scanned
quote to quote the same way. Only the rare paths (a stray CR, a line break
inside quotes) walk characters, and only over the short stretch that needs
it. A CR is never searched for by scanning the rest of the text; it is
looked for inside the short segment already cut out.

## Local numbers (practice set, 6 cases, 10.2 MB of CSV)

| | CPU time |
|---|---|
| this `solve.js` | ~123 ms |
| csv-reader 1.0.0 (house baseline) | ~870 ms |
| speedup | ~7x |

Correctness was checked against the reference on the practice set plus
~5,000 fuzzed nasty inputs (random quote/CR/LF/empty-field soup and
structured broken records): identical answers on every one.

## Layout

- `solve.js` — the entry: `export function run(input)`.
- `main.ts` — the harness driver (reads `/input/cases.json`, writes `/output/answers.json`).
- `package.json` — `{"type": "module"}`.
- `LICENSE` — MIT.
