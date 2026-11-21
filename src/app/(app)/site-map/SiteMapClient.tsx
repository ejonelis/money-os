"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { SITE_ROUTES } from "./routes";
import edited from "./edited.json";

const EDITED = edited as Record<string, string>;

export function SiteMapClient() {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SITE_ROUTES;
    return SITE_ROUTES.filter((r) =>
      `${r.area} ${r.path} ${r.note ?? ""}`.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div className="space-y-4">
      <div className="relative w-full max-w-xs">
        <Search
          size={16}
          strokeWidth={1.6}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a page…"
          className="w-full rounded-md border border-hairline bg-surface py-2 pl-9 pr-3 text-sm placeholder:text-foreground/40"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-hairline shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline bg-surface text-left text-muted">
              <th className="px-4 py-2 font-normal">Area</th>
              <th className="px-4 py-2 font-normal">Page</th>
              <th className="px-4 py-2 font-normal">Edited</th>
              <th className="px-4 py-2 font-normal">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.path} className="border-b border-hairline last:border-0">
                <td className="px-4 py-2 text-muted">{r.area}</td>
                <td className="px-4 py-2 font-mono text-[13px]">
                  {r.linkable ? (
                    <Link
                      href={r.path}
                      className="transition-colors hover:text-accent"
                    >
                      {r.path}
                    </Link>
                  ) : (
                    r.path
                  )}
                </td>
                <td className="px-4 py-2 tabular-nums text-muted">{EDITED[r.path] ?? "—"}</td>
                <td className="px-4 py-2 text-muted">{r.note ?? ""}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-foreground/40">
                  No matching pages.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
