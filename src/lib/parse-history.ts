export type HistoryRow = { date: string; total: number };

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function iso(y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return dt.toISOString().slice(0, 10);
}

// Pulls a date and a net-worth number out of each line. Understands
// 2015-10-28, 28/10/2015 (day first), and "Oct 28, 2015"; the number can
// have commas, a € sign, or a minus (including "−").
export function parseHistory(text: string): { rows: HistoryRow[]; skipped: number } {
  const rows = new Map<string, number>();
  let skipped = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/−/g, "-").trim();
    if (!line) continue;

    let date: string | null = null;
    let rest = line;

    let m = line.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      date = iso(+m[1], +m[2], +m[3]);
      rest = line.replace(m[0], " ");
    } else if ((m = line.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/))) {
      date = iso(+m[3], +m[2], +m[1]);
      rest = line.replace(m[0], " ");
    } else if ((m = line.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/))) {
      const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
      date = month ? iso(+m[3], month, +m[2]) : null;
      rest = line.replace(m[0], " ");
    }

    const num = rest.match(/-?\s*€?\s*-?\d[\d,]*(?:\.\d+)?/);
    const total = num ? Number(num[0].replace(/[€,\s]/g, "")) : NaN;

    if (!date || Number.isNaN(total)) {
      skipped++;
      continue;
    }
    rows.set(date, total);
  }

  return {
    rows: Array.from(rows, ([date, total]) => ({ date, total })).sort((a, b) =>
      a.date < b.date ? -1 : 1,
    ),
    skipped,
  };
}
