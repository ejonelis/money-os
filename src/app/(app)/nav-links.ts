import {
  CalendarClock,
  Landmark,
  LayoutGrid,
  CreditCard,
  Receipt,
  PiggyBank,
  Scale,
  TrendingDown,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

// Apple system colours — one colour per meaning.
export const APPLE_COLORS = {
  blue: "#0a7aff",
  indigo: "#5e5ce6",
  purple: "#af52de",
  pink: "#ff2d6f",
  red: "#ff453a",
  orange: "#ff9500",
  yellow: "#e0a100",
  green: "#2fb450",
  mint: "#00b5a0",
  teal: "#1fa3c4",
  cyan: "#2f9de8",
  brown: "#a2845e",
  graphite: "#7c7c82",
} as const;

export type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  color: string;
};

// Single lookup table: every page gets its icon + colour here, and the
// type makes both required, so a page can't be added without them.
export const NAV_LINKS: NavLink[] = [
  { href: "/bills-forecast", label: "Bills Forecast", icon: CalendarClock, color: APPLE_COLORS.blue },
  { href: "/main-forecast", label: "Main Forecast", icon: Wallet, color: APPLE_COLORS.cyan },
  { href: "/credit-card-forecast", label: "CC Forecast", icon: CreditCard, color: APPLE_COLORS.purple },
  { href: "/bills", label: "Monthly Bills", icon: Receipt, color: APPLE_COLORS.orange },
  { href: "/networth", label: "Net Worth", icon: TrendingUp, color: APPLE_COLORS.green },
];

// Pages that aren't in the top menu; they live on the Other page.
export const OTHER_LINKS: NavLink[] = [
  { href: "/spending", label: "Spending", icon: PiggyBank, color: APPLE_COLORS.pink },
  { href: "/debts", label: "Debts", icon: TrendingDown, color: APPLE_COLORS.red },
  { href: "/accounts", label: "Accounts", icon: Landmark, color: APPLE_COLORS.teal },
  { href: "/balances", label: "Balances", icon: Scale, color: APPLE_COLORS.indigo },
]

export const OTHER_LINK: NavLink = {
  href: "/other",
  label: "Other",
  icon: LayoutGrid,
  color: APPLE_COLORS.graphite,
};
