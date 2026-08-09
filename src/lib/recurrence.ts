export type Frequency = "yearly" | "monthly" | "weekly";

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

  if (rule.frequency === "monthly") {
    const d = Math.min(anchor.d, daysInMonth(year, month));
    return [toISO(year, month, d)];
  }

  if (rule.frequency === "yearly") {
    if (month !== anchor.m) return [];
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
