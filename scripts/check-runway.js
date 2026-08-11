// Fails the job when data/events.csv is close to running out. The daily workflow
// then turns red months before the feed would start missing dates, instead of
// breaking on the first uncovered morning.
//
//   node scripts/check-runway.js [minDays]

const fs = require('fs');
const path = require('path');

const MIN_DAYS = Number(process.argv[2] || 90);
const CSV_PATH = path.join(__dirname, '..', 'data', 'events.csv');

const dates = fs
  .readFileSync(CSV_PATH, 'utf8')
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => line.split(',')[0].trim())
  .filter(Boolean);

const lastDate = dates[dates.length - 1];
const today = new Date().toISOString().split('T')[0];
const remaining = Math.round(
  (Date.parse(`${lastDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000
);

console.log(`data/events.csv ends ${lastDate} — ${remaining} days of runway`);

if (remaining < MIN_DAYS) {
  console.error(
    `::error::data/events.csv has ${remaining} days left (threshold ${MIN_DAYS}). ` +
      'Regenerate it: node scripts/generate-events-csv.js <startYear> <endYear> > data/events.csv'
  );
  process.exit(1);
}
