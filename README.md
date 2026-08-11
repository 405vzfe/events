# events

A one-file JSON feed that tells a consumer which market-event flags apply to the current date.

**Endpoint:** https://405vzfe.github.io/events/events.json

```json
{
  "date": "2026-08-11",
  "opex_minus_one": false,
  "vixpiration_minus_one": false,
  "vixpiration": false,
  "vixpiration_plus_one": false
}
```

## How it works

`data/events.csv` holds one row per calendar day. `process-data.js` selects the row for the
current UTC date and writes it to `events.json`. A GitHub Actions workflow runs this three
times a day and publishes the result to GitHub Pages.

## Flag definitions

| Flag | Meaning |
| --- | --- |
| `opex_minus_one` | The trading day before monthly OPEX (third Friday). |
| `vixpiration` | VIX monthly settlement: 30 days before the SPX expiration it references. |
| `vixpiration_minus_one` | The trading day before `vixpiration`. |
| `vixpiration_plus_one` | The trading day after `vixpiration`. |

Both expirations roll back to the prior trading day when the NYSE is closed. Adjacency is
measured in **trading days, not calendar days**, so a flag never lands on a market holiday.

## Extending the calendar

`data/events.csv` currently covers 2025-01-01 through 2030-12-31. To extend it:

```bash
node scripts/generate-events-csv.js 2025 2035 > data/events.csv
```

The generator derives every flag from the NYSE holiday calendar. Regenerating over an
existing range is a no-op.

## Guard rails

- `process-data.js` **exits non-zero** if the current date is missing from the CSV. It never
  publishes a fabricated all-false row, because consumers read the flags without checking
  `date` — a wrong `false` would silently permit trading on an expiration day.
- `scripts/check-runway.js` fails the workflow when fewer than 90 days of CSV remain. It runs
  after the deploy, so the alert never blocks the day's data.

## Consumer note

`events.json` is a snapshot of one day. A consumer should compare the `date` field against its
own clock and refuse to act on a stale file. As of 2026-08-11 the options bot's
`FetchSupplementalEvent` does not do this.
