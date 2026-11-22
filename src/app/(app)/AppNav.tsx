"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Home, LayoutGrid, Menu, Search, User, X } from "lucide-react";
import { NAV_LINKS, OTHER_LINK, OTHER_LINKS } from "./nav-links";

export function AppNav({
  email,
  signOutAction,
}: {
  email: string;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);

  // Close the person menu on outside click or Escape.
  useEffect(() => {
    if (!userOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!userRef.current?.contains(e.target as Node)) setUserOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [userOpen]);

  const onOtherPage =
    pathname === OTHER_LINK.href ||
    OTHER_LINKS.some((l) => pathname === l.href || pathname.startsWith(`${l.href}/`));

  const iconBtn =
    "flex h-9 w-9 items-center justify-center text-foreground/60 transition-colors hover:bg-surface hover:text-accent";

  return (
    <header className="border-b border-hairline">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-1">
          <Link
            href="/dashboard"
            aria-label="Home"
            className={`${iconBtn} rounded-full ${
              pathname === "/dashboard" ? "text-accent" : ""
            }`}
          >
            <Home size={18} strokeWidth={1.6} />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 xl:flex">
            {NAV_LINKS.map(({ href, label, icon: Icon, color }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors hover:bg-surface ${
                    active ? "bg-surface font-medium" : "text-foreground/70"
                  }`}
                >
                  <Icon size={16} strokeWidth={1.6} color={color} />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-1">
          <div ref={userRef} className="relative">
            <button
              type="button"
              onClick={() => setUserOpen((v) => !v)}
              aria-label="Account menu"
              aria-expanded={userOpen}
              className={iconBtn}
            >
              <User size={18} strokeWidth={1.6} />
            </button>
            {userOpen && (
              <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-lg border border-hairline bg-background shadow-md">
                <div className="border-b border-hairline px-4 py-3">
                  <p className="text-xs text-muted">Signed in as</p>
                  <p className="truncate text-sm font-medium">{email}</p>
                </div>
                <Link
                  href="/account/set-password"
                  onClick={() => setUserOpen(false)}
                  className="block px-4 py-2.5 text-sm transition-colors hover:bg-surface"
                >
                  Set password
                </Link>
                <form action={signOutAction} className="border-t border-hairline">
                  <button
                    type="submit"
                    className="w-full rounded-none px-4 py-2.5 text-left text-sm text-red-500 transition-colors hover:bg-surface"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            )}
          </div>

          <Link
            href={OTHER_LINK.href}
            aria-label="Other"
            className={`${iconBtn} rounded-full ${onOtherPage ? "text-accent" : ""}`}
          >
            <LayoutGrid size={18} strokeWidth={1.6} />
          </Link>

          <Link
            href="/site-map"
            aria-label="Site map"
            className={`${iconBtn} rounded-full ${
              pathname === "/site-map" ? "text-accent" : ""
            }`}
          >
            <Search size={18} strokeWidth={1.6} />
          </Link>

          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className={`${iconBtn} xl:hidden`}
          >
            {menuOpen ? (
              <X size={18} strokeWidth={1.6} />
            ) : (
              <Menu size={18} strokeWidth={1.6} />
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu panel */}
      {menuOpen && (
        <div className="border-t border-hairline xl:hidden">
          <nav className="mx-auto flex max-w-4xl flex-col px-6 py-2">
            {NAV_LINKS.map(({ href, label, icon: Icon, color }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 border-b border-hairline py-3 text-sm transition-colors last:border-0 hover:text-accent"
              >
                <Icon size={16} strokeWidth={1.6} color={color} />
                {label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
