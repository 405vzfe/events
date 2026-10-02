// Fails the job when data/events.csv, or one of the hand-maintained date lists in
// data/ (fomc, cpi, early_close), is close to running out or already past it, and when
// the CSV disagrees with a list (a list edited without regenerating the CSV). It runs
// after the deploy, so a red run never blocks the day's data.
//
//   node scripts/check-runway.js [minDays] [minListDays]

const fs = require('fs');
const path = require('path');

const { readLists, LIST_FIX_HINT } = require('./date-lists');

const MIN_DAYS = Number(process.argv[2] || 90);
// Lower than the CSV threshold: BLS publishes next year's CPI calendar only a few months ahead.
const MIN_LIST_DAYS = Number(process.argv[3] || 45);
const CSV_PATH = path.join(__dirname, '..', 'data', 'events.csv');

const [header, ...rows] = fs
  .readFileSync(CSV_PATH, 'utf8')
  .trim()
  .split(/\r?\n/)
  .map((line) => line.split(',').map((v) => v.trim()));
const dates = rows.map((r) => r[0]);

const today = new Date().toISOString().split('T')[0];
const daysLeft = (last) =>
  Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);

let failed = false;
const check = (label, last, minDays, fix) => {
  const remaining = daysLeft(last);
  console.log(`${label} ends ${last} — ${remaining} days of runway`);
  if (remaining < minDays) {
    console.error(`::error::${label} has ${remaining} days left (threshold ${minDays}). ${fix}`);
    failed = true;
  }
};

check('data/events.csv', dates[dates.length - 1], MIN_DAYS,
  'Regenerate it: node scripts/generate-events-csv.js <startYear> <endYear> > data/events.csv');
for (const [field, list] of Object.entries(readLists())) {
  check(list.file, list.coversThrough, MIN_LIST_DAYS, LIST_FIX_HINT);

  const col = header.indexOf(field);
  const inCsv = rows.filter((r) => r[col] === 'true').map((r) => r[0]).join();
  const listed = list.dates.filter((d) => d >= dates[0] && d <= dates[dates.length - 1]).sort().join();
  if (inCsv !== listed) {
    console.error(`::error::data/events.csv column ${field} does not match ${list.file}. Regenerate the CSV.`);
    failed = true;
  }
}

if (failed) process.exit(1);
