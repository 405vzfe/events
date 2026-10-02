// Hand-maintained event dates that no calendar rule can derive (FOMC, CPI, NYSE early
// closes). Each file in data/ holds one ISO date per line and states how far it is complete:
//
//   # covers through: YYYY-MM-DD
//
// Past that date the list is unknown, not empty. scripts/check-runway.js turns the workflow
// red well before then, and stays red after it (see process-data.js for why it still publishes).

const fs = require('fs');
const path = require('path');

const LISTS = { fomc: 'fomc.txt', cpi: 'cpi.txt', earlyClose: 'early_close.txt' };

const ISO_DATE = '\\d{4}-\\d{2}-\\d{2}';
const COVERS_RE = new RegExp(`^#\\s*covers through:\\s*(${ISO_DATE})\\s*$`);
const DATE_RE = new RegExp(`^${ISO_DATE}$`);

const LIST_FIX_HINT = 'Add the newly published dates, bump "# covers through", and regenerate the CSV.';

function readList(name) {
  const file = `data/${LISTS[name]}`;
  const lines = fs.readFileSync(path.join(__dirname, '..', file), 'utf8').split(/\r?\n/);

  const covers = lines.map((l) => l.match(COVERS_RE)).filter(Boolean);
  if (covers.length !== 1) throw new Error(`${file}: need exactly one "# covers through: YYYY-MM-DD"`);
  const coversThrough = covers[0][1];

  const dates = lines.map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  for (const d of dates) {
    if (!DATE_RE.test(d)) throw new Error(`${file}: bad date "${d}"`);
    if (d > coversThrough) throw new Error(`${file}: ${d} is after covers-through ${coversThrough}`);
  }
  return { file, coversThrough, dates };
}

const readLists = () => Object.fromEntries(Object.keys(LISTS).map((n) => [n, readList(n)]));

module.exports = { readLists, LIST_FIX_HINT };
