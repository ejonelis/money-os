import { revalidatePath } from "next/cache";

// Both forecast pages read from the same ledger, so any change to bills or
// transactions needs to refresh both.
export function revalidateForecasts() {
  revalidatePath("/bills-forecast");
  revalidatePath("/credit-card-forecast");
  revalidatePath("/main-forecast");
  revalidatePath("/spending");
}
