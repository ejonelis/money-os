import { findMainAccount } from "@/lib/accounts";
import { AccountForecast } from "../bills-forecast/AccountForecast";

export default function MainForecastPage() {
  return (
    <AccountForecast
      pick={findMainAccount}
      title={(account) => `${account.name} Forecast`}
      notFound="No account with “main” in its name was found."
    />
  );
}
