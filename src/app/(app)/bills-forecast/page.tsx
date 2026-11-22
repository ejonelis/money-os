import { findBillsAccount } from "@/lib/accounts";
import { AccountForecast } from "./AccountForecast";

export default function ForecastPage() {
  return (
    <AccountForecast
      pick={(accounts) => findBillsAccount(accounts) ?? accounts[0]}
      notFound="No accounts yet — nothing to forecast."
    />
  );
}
