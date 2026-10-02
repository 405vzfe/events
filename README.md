# events

A one-file JSON feed that tells a consumer which market-event flags apply to the current date.

**Endpoint:** https://405vzfe.github.io/events/events.json

```json
{
  "date": "2026-10-02",
  "opex_minus_one": false,
  "vixpiration_minus_one": false,
  "vixpiration": false,
  "vixpiration_plus_one": false,
  "eoq_plus_one": false,
  "earlyClose": false,
  "fomc": false,
  "fomcPlusOne": false,
  "cpi": false,
  "eom": false,
  "eoq": false,
  "opex": false
}
```

## How it works

`data/events.csv` holds one row per calendar day. `process-data.js` selects the row for the
current UTC date and writes it to `events.json`. A GitHub Actions workflow is scheduled to run
this hourly from 00:17 to 12:17 UTC (best-effort; GitHub cron runs late or drops slots) and
publishes the result to GitHub Pages.

## Flag definitions

| Flag | Meaning |
| --- | --- |
| `opex_minus_one` | The trading day before monthly OPEX (third Friday). |
| `vixpiration` | VIX monthly settlement: 30 days before the SPX expiration it references. |
| `vixpiration_minus_one` | The trading day before `vixpiration`. |
| `vixpiration_plus_one` | The trading day after `vixpiration`. |
| `eoq_plus_one` | The first trading day of a quarter (Jan, Apr, Jul, Oct). |
| `earlyClose` | NYSE 1:00 pm early close (`data/early_close.txt`). |
| `fomc` | FOMC decision day: the statement day, last day of the meeting (`data/fomc.txt`). |
| `fomcPlusOne` | The trading day after `fomc`. |
| `cpi` | BLS CPI release day (`data/cpi.txt`). |
| `eom` | Last trading day of a month that does not end a quarter. |
| `eoq` | Last trading day of a quarter (Mar, Jun, Sep, Dec). Never also `eom`. |
| `opex` | Monthly OPEX: the third Friday. |

The camelCase keys mirror https://xiles.io/api/today, with the same names and meanings, so this feed can
stand in for it. They match the backtester's `input_spx_ohlc.csv` (FOMC/CPI/OPEX code 100, FOMC
101, EOM 100 vs 200, CloseTime 13): 0 mismatches over 2025-01-02 to 2026-09-30.

Both expirations roll back to the prior trading day when the NYSE is closed. Adjacency is
measured in **trading days, not calendar days**, so a flag never lands on a market holiday.

## Extending the calendar

`data/events.csv` currently covers 2025-01-01 through 2030-12-31. To extend it:

```bash
node scripts/generate-events-csv.js 2025 2035 > data/events.csv
```

The generator derives every flag from the NYSE holiday calendar except `fomc`, `cpi`, and
`earlyClose`. Those come from the hand-maintained lists in `data/`, which have one date per line
and a `# covers through: YYYY-MM-DD` header. When the Fed, BLS, or NYSE publish a new year, add the
dates, bump the header, and regenerate. The generator fails on a listed date that is not a
trading day. Regenerating over an existing range is a no-op.

## Guard rails

- `process-data.js` **exits non-zero** if the current date is missing from the CSV. It never
  publishes a fabricated all-false row, because consumers read the flags without checking
  `date` — a wrong `false` would silently permit trading on an expiration day.
- Past a list's `covers through`, `process-data.js` still publishes, with that list's flag
  `false`, and logs an error. Refusing would leave yesterday's file live, and since consumers don't
  check `date` that would freeze **every** flag, not just the one we can't fill.
- `scripts/check-runway.js` fails the workflow when fewer than 90 days of CSV, or 45 days of
  any date list, remain (and keeps failing past the end). It also fails when the CSV disagrees
  with a list, meaning a list was edited without regenerating. It runs after the deploy, so the
  alert never blocks the day's data.
  BLS publishes the next year's CPI calendar late, so `data/cpi.txt` is the list most likely to
  trip this.

## Consumer note

`events.json` is a snapshot of one day. A consumer should compare the `date` field against its
own clock and refuse to act on a stale file. As of 2026-08-11 the options bot's
`FetchSupplementalEvent` does not do this.
