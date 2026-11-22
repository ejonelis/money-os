// Every page in the app. Add a row here when you add a page.
export type SiteRoute = {
  area: string;
  path: string;
  note?: string;
  // Dynamic routes can't be linked directly.
  linkable?: boolean;
};

export const SITE_ROUTES: SiteRoute[] = [
  { area: "Home", path: "/", note: "Redirects to /dashboard" },
  { area: "Home", path: "/dashboard", note: "Tile hub", linkable: true },
  { area: "Bills", path: "/bills-forecast", note: "Upcoming bills by day, balance reconciliation", linkable: true },
  { area: "Bills", path: "/credit-card-forecast", note: "Card balance, payments from Bills, payoff estimate", linkable: true },
  { area: "Bills", path: "/bills", note: "Monthly recurring bills", linkable: true },
  { area: "Money", path: "/balances", note: "Daily balance check-ins", linkable: true },
  { area: "Money", path: "/accounts", note: "Accounts hub", linkable: true },
  { area: "Money", path: "/accounts/[id]", note: "Account ledger and payments" },
  { area: "Money", path: "/debts", note: "Debt progress", linkable: true },
  { area: "Money", path: "/networth", note: "Net worth and account groups", linkable: true },
  { area: "Settings", path: "/account/set-password", note: "Set or change password", linkable: true },
  { area: "Settings", path: "/site-map", note: "This page", linkable: true },
  { area: "Auth", path: "/login", note: "Sign in", linkable: true },
  { area: "Auth", path: "/auth/callback", note: "Auth code exchange (route handler)" },
];
