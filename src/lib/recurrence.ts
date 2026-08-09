export const FREQUENCIES = [
  "weekly",
  "monthly",
  "bimonthly",
  "quarterly",
  "yearly",
] as const;

export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  bimonthly: "Every 2 months",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

// Every non-weekly frequency is "every N months" — monthly is just N=1 and
// yearly is N=12, so they all share one code path below.
const MONTH_STEP: Record<Exclude<Frequency, "weekly">, number> = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  yearly: 12,
};

export type RecurringRuleLike = {
  frequency: Frequency;
  next_due_date: string; // "YYYY-MM-DD"
};

type YMD = { y: number; m: number; d: number };

function parseISODate(s: string): YMD {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function toISO(y: number, m: number, d: number): string {
  return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
}

function weekdayOf(y: number, m: number, d: number): number {
  // 0 = Sunday ... 6 = Saturday
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function compareYMD(a: YMD, b: YMD): number {
  if (a.y !== b.y) return a.y - b.y;
  if (a.m !== b.m) return a.m - b.m;
  return a.d - b.d;
}

/**
 * Returns the ISO dates within the given calendar month that this rule
 * would fall on, projecting forward from `next_due_date`. Rules never show
 * occurrences before their anchor date — there's no history to project
 * backward from (see plan: forward-only, no historical import).
 */
export function occurrencesInMonth(
  rule: RecurringRuleLike,
  year: number,
  month: number, // 1-12
): string[] {
  const anchor = parseISODate(rule.next_due_date);
  const monthStart: YMD = { y: year, m: month, d: 1 };

  if (compareYMD(monthStart, { y: anchor.y, m: anchor.m, d: 1 }) < 0) {
    return [];
  }

  if (rule.frequency !== "weekly") {
    const step = MONTH_STEP[rule.frequency];
    const monthDiff = (year - anchor.y) * 12 + (month - anchor.m);
    if (monthDiff % step !== 0) return [];
    const d = Math.min(anchor.d, daysInMonth(year, month));
    return [toISO(year, month, d)];
  }

  // weekly
  const targetWeekday = weekdayOf(anchor.y, anchor.m, anchor.d);
  const total = daysInMonth(year, month);
  const dates: string[] = [];
  for (let d = 1; d <= total; d++) {
    if (weekdayOf(year, month, d) !== targetWeekday) continue;
    if (compareYMD({ y: year, m: month, d }, anchor) < 0) continue;
    dates.push(toISO(year, month, d));
  }
  return dates;
}

/**
 * Returns every occurrence of this rule between fromISO and toISO
 * (inclusive), for materializing a forward ledger. Walks month by month
 * and reuses occurrencesInMonth, so it inherits the same forward-only
 * behavior.
 */
export function occurrencesInRange(
  rule: RecurringRuleLike,
  fromISO: string,
  throughISO: string,
): string[] {
  const from = parseISODate(fromISO);
  const through = parseISODate(throughISO);
  const dates: string[] = [];

  let y = from.y;
  let m = from.m;
  while (y < through.y || (y === through.y && m <= through.m)) {
    for (const iso of occurrencesInMonth(rule, y, m)) {
      if (iso >= fromISO && iso <= throughISO) dates.push(iso);
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return dates;
}
