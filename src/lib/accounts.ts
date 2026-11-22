type NamedAccount = { id: string; name: string; type?: string | null };

// The credit card account: by type first, then by a name like "CC".
export function findCardAccount<T extends NamedAccount>(accounts: T[] | null) {
  return (
    accounts?.find((a) => a.type === "credit_card") ??
    accounts?.find((a) => /^cc$|credit|card/i.test(a.name.trim()))
  );
}

// The main bills account (the one card payments come out of).
export function findBillsAccount<T extends NamedAccount>(
  accounts: T[] | null,
  excludeId?: string,
) {
  return accounts?.find((a) => a.id !== excludeId && /bills/i.test(a.name));
}
