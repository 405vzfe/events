const fs = require('fs');
const path = require('path');
const { readLists, LIST_FIX_HINT } = require('./scripts/date-lists');

const CSV_PATH = path.join(__dirname, 'data/events.csv');
const OUT_PATH = path.join(__dirname, 'events.json');

function parseCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  const headers = lines[0].split(',').map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim());
    const row = {};

    headers.forEach((header, index) => {
      const value = values[index] || '';
      row[header] = header === 'date' ? value : value.toLowerCase() === 'true' || value === '1';
    });

    return row;
  });
}

function main() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD, UTC

  let data;
  try {
    data = parseCSV(fs.readFileSync(CSV_PATH, 'utf8'));
  } catch (error) {
    console.error('Cannot read data/events.csv:', error.message);
    process.exit(1);
  }

  const todaysData = data.find((row) => row.date === today);

  // Fail instead of publishing a row we cannot fill in. Consumers read the flags
  // without checking the date, so a file stamped today with fabricated false
  // flags would silently permit trading on an OPEX or VIX expiration day. A
  // failed run is loud; a wrong flag is not.
  if (!todaysData) {
    console.error(`::error::No row for ${today} in data/events.csv.`);
    console.error(`CSV covers ${data[0].date} through ${data[data.length - 1].date}.`);
    console.error('Regenerate it: node scripts/generate-events-csv.js <startYear> <endYear> > data/events.csv');
    process.exit(1);
  }

  // Past a list's "covers through" its flag reads false whether or not the event happens.
  // Publish anyway: exiting here would leave yesterday's file live, and since consumers
  // don't check `date` that freezes EVERY flag (a stale eoq=true would read true all week).
  // check-runway.js fails the workflow after the deploy, so this stays loud.
  for (const list of Object.values(readLists())) {
    if (today > list.coversThrough) {
      console.error(`::error::${list.file} covers through ${list.coversThrough}; its flag is unknown today. ${LIST_FIX_HINT}`);
    }
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(todaysData, null, 2) + '\n');
  console.log(`Wrote events.json for ${today}:`, todaysData);
}

main();
