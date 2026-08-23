"use client";

const currency = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type CalendarEntry = { id: string; label: string; amount: number };

function formatSigned(amount: number) {
  const formatted = currency.format(Math.abs(amount));
  return amount >= 0 ? `+${formatted}` : `-${formatted}`;
}

export function CalendarGrid({
  year,
  month,
  entries,
  onSelect,
}: {
  year: number;
  month: number;
  entries: Map<string, CalendarEntry[]>;
  onSelect: (id: string) => void;
}) {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="overflow-x-auto rounded-md border border-foreground/15">
      <div className="grid min-w-[640px] grid-cols-7 border-b border-foreground/15 text-xs text-foreground/60">
        {WEEKDAY_NAMES.map((d) => (
          <div key={d} className="px-2 py-2 text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid min-w-[640px] grid-cols-7">
        {cells.map((day, i) => {
          const iso = day
            ? `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`
            : null;
          const dayEntries = iso ? entries.get(iso) ?? [] : [];
          return (
            <div
              key={i}
              className="min-h-24 border-b border-r border-foreground/10 p-1.5 last:border-r-0 [&:nth-child(7n)]:border-r-0"
            >
              {day && (
                <>
                  <div className="text-xs text-foreground/40">{day}</div>
                  <div className="mt-1 space-y-1">
                    {dayEntries.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => onSelect(e.id)}
                        className={`block w-full truncate rounded px-1 py-0.5 text-left text-[11px] leading-tight hover:bg-foreground/20 ${
                          e.amount >= 0
                            ? "bg-emerald-600/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-foreground/10"
                        }`}
                        title={`${e.label} — ${formatSigned(e.amount)}`}
                      >
                        {e.label} · {formatSigned(e.amount)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
