// Generates data/events.csv: one row per calendar day with OPEX, VIX expiration,
// month/quarter-boundary, FOMC, CPI and early-close flags.
//
//   node scripts/generate-events-csv.js <startYear> <endYear> > data/events.csv
//
// Rules encoded here:
//   opex(m)             third Friday of month m, rolled back to the prior trading day
//                       if the NYSE is closed that Friday (Good Friday, Juneteenth).
//   vixpiration(m)      opex(m+1) minus 30 days, rolled back to the prior trading day
//                       if the NYSE is closed that day.
//   monthEnd(m)         last trading day of month m. Flagged eoq in Mar/Jun/Sep/Dec and
//                       eom in every other month (never both, matching xiles.io).
//   fomc, cpi,          dates from data/fomc.txt, data/cpi.txt, data/early_close.txt
//   earlyClose          (see scripts/date-lists.js). fomcPlusOne is the next trading day.
//   *_minus_one         the prior trading day.
//   *_plus_one          the next trading day.
//
// The xiles.io keys (earlyClose, fomc, fomcPlusOne, cpi, eom, eoq, opex) keep its camelCase
// names so this feed can stand in for it. They match the backtester's input_spx_ohlc.csv:
// FOMC/CPI/OPEX code 100, FOMC 101, EOM 100 (eom) / 200 (eoq), CloseTime 13.
//
// Verified against the hand-built 2025-2026 rows: all 730 match exactly.

const { readLists } = require('./date-lists');

const DAY_MS = 86400000;

const iso = (d) => d.toISOString().slice(0, 10);
const utc = (y, m, day) => new Date(Date.UTC(y, m, day));
const addDays = (d, n) => new Date(d.getTime() + n * DAY_MS);

// nth (1-based) weekday of a month; dow 0=Sun..6=Sat.
function nthWeekday(year, month, dow, n) {
  const first = utc(year, month, 1);
  const offset = (dow - first.getUTCDay() + 7) % 7;
  return utc(year, month, 1 + offset + (n - 1) * 7);
}

function lastWeekday(year, month, dow) {
  const last = utc(year, month + 1, 0);
  return addDays(last, -((last.getUTCDay() - dow + 7) % 7));
}

// Anonymous Gregorian computus. Returns Easter Sunday.
function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month, day);
}

// A fixed-date holiday moves to Friday when it lands on Saturday, Monday when it lands on Sunday.
function observed(d) {
  if (d.getUTCDay() === 6) return addDays(d, -1);
  if (d.getUTCDay() === 0) return addDays(d, 1);
  return d;
}

// NYSE full-day closures. Excludes ad hoc closures (funerals, weather, 2001-09-11).
// A Saturday New Year's Day is not observed: NYSE stays open on Dec 31 (year end).
function nyseHolidays(year) {
  const newYear = utc(year, 0, 1);
  return [
    ...(newYear.getUTCDay() === 6 ? [] : [observed(newYear)]), // New Year's Day
    nthWeekday(year, 0, 1, 3), // Martin Luther King Jr. Day
    nthWeekday(year, 1, 1, 3), // Washington's Birthday
    addDays(easter(year), -2), // Good Friday
    lastWeekday(year, 4, 1), // Memorial Day
    observed(utc(year, 5, 19)), // Juneteenth
    observed(utc(year, 6, 4)), // Independence Day
    nthWeekday(year, 8, 1, 1), // Labor Day
    nthWeekday(year, 10, 4, 4), // Thanksgiving
    observed(utc(year, 11, 25)), // Christmas
  ].map(iso);
}

function buildHolidaySet(startYear, endYear) {
  const set = new Set();
  for (let y = startYear - 1; y <= endYear + 1; y++) {
    for (const h of nyseHolidays(y)) set.add(h);
  }
  return set;
}

const isTradingDay = (d, holidays) =>
  d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !holidays.has(iso(d));

function prevTradingDay(d, holidays) {
  let cur = addDays(d, -1);
  while (!isTradingDay(cur, holidays)) cur = addDays(cur, -1);
  return cur;
}

function nextTradingDay(d, holidays) {
  let cur = addDays(d, 1);
  while (!isTradingDay(cur, holidays)) cur = addDays(cur, 1);
  return cur;
}

// Roll back to a trading day, staying put if already one.
function onOrPrevTradingDay(d, holidays) {
  let cur = d;
  while (!isTradingDay(cur, holidays)) cur = addDays(cur, -1);
  return cur;
}

// Monthly SPX/equity expiration: third Friday, rolled back if the NYSE is closed.
const opex = (year, month, holidays) =>
  onOrPrevTradingDay(nthWeekday(year, month, 5, 3), holidays);

// VIX monthly settlement: 30 days before the SPX expiration it references.
const vixpiration = (year, month, holidays) =>
  onOrPrevTradingDay(addDays(opex(year, month + 1, holidays), -30), holidays);

// Last trading day of a month. Quarter-end months are 2, 5, 8, 11.
const monthEnd = (year, month, holidays) => onOrPrevTradingDay(utc(year, month + 1, 0), holidays);
const isQuarterEnd = (month) => (month + 12) % 3 === 2;

function main() {
  const startYear = Number(process.argv[2]);
  const endYear = Number(process.argv[3]);
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || endYear < startYear) {
    console.error('usage: node scripts/generate-events-csv.js <startYear> <endYear>');
    process.exit(1);
  }

  const holidays = buildHolidaySet(startYear, endYear);
  const flags = new Map();
  const mark = (d, field) => {
    const key = iso(d);
    if (!flags.has(key)) flags.set(key, {});
    flags.get(key)[field] = true;
  };

  // Widen by a month on each side so boundary months get their neighbours right.
  for (let y = startYear; y <= endYear; y++) {
    for (let m = -1; m <= 12; m++) {
      const o = opex(y, m, holidays);
      const v = vixpiration(y, m, holidays);
      const me = monthEnd(y, m, holidays);
      mark(o, 'opex');
      mark(prevTradingDay(o, holidays), 'opex_minus_one');
      mark(prevTradingDay(v, holidays), 'vixpiration_minus_one');
      mark(v, 'vixpiration');
      mark(nextTradingDay(v, holidays), 'vixpiration_plus_one');
      if (isQuarterEnd(m)) {
        mark(me, 'eoq');
        mark(nextTradingDay(me, holidays), 'eoq_plus_one');
      } else {
        mark(me, 'eom');
      }
    }
  }

  // A listed date on a closed day is a typo; fail rather than publish a flag nobody trades.
  for (const [field, list] of Object.entries(readLists())) {
    for (const date of list.dates) {
      const d = new Date(`${date}T00:00:00Z`);
      if (!isTradingDay(d, holidays)) throw new Error(`${list.file}: ${date} is not an NYSE trading day`);
      mark(d, field);
      if (field === 'fomc') mark(nextTradingDay(d, holidays), 'fomcPlusOne');
    }
  }

  const headers = [
    'date',
    'opex_minus_one',
    'vixpiration_minus_one',
    'vixpiration',
    'vixpiration_plus_one',
    'eoq_plus_one',
    'earlyClose',
    'fomc',
    'fomcPlusOne',
    'cpi',
    'eom',
    'eoq',
    'opex',
  ];
  const lines = [headers.join(',')];
  for (let d = utc(startYear, 0, 1); d.getUTCFullYear() <= endYear; d = addDays(d, 1)) {
    const row = flags.get(iso(d)) || {};
    lines.push([iso(d), ...headers.slice(1).map((h) => (row[h] ? 'true' : 'false'))].join(','));
  }

  process.stdout.write(lines.join('\n') + '\n');
}

main();
