"use client";

import Link from "next/link";
import { useState } from "react";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/bills", label: "Bills" },
];

export function AppNav({
  email,
  signOutAction,
}: {
  email: string;
  signOutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="border-b border-foreground/10">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <Link href="/dashboard" className="font-semibold tracking-tight">
          Money OS
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 sm:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-foreground/60 hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-4 sm:flex">
          <Link
            href="/account/set-password"
            className="text-sm text-foreground/60 hover:text-foreground"
          >
            {email}
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-md border border-foreground/15 px-3 py-1.5 text-sm"
            >
              Sign out
            </button>
          </form>
        </div>

        {/* Mobile menu toggle */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-foreground/15 sm:hidden"
        >
          {open ? (
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
              <path
                d="M4 4l12 12M16 4L4 16"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
              <path
                d="M3 5h14M3 10h14M3 15h14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu panel */}
      {open && (
        <div className="border-t border-foreground/10 sm:hidden">
          <nav className="mx-auto flex max-w-4xl flex-col px-6 py-2">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="border-b border-foreground/10 py-3 text-sm text-foreground/80 last:border-0"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/account/set-password"
              onClick={() => setOpen(false)}
              className="border-b border-foreground/10 py-3 text-sm text-foreground/60"
            >
              {email}
            </Link>
            <form action={signOutAction} className="py-3">
              <button
                type="submit"
                className="w-full rounded-md border border-foreground/15 px-3 py-1.5 text-left text-sm"
              >
                Sign out
              </button>
            </form>
          </nav>
        </div>
      )}
    </header>
  );
}
