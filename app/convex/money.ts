// The one way an amount is written for a person: whole dollars bare ("$500"),
// cents only when there are some, and then both digits ("$12.50", never
// "$12.5" or "$500.00"). Pure, so pages import it too.

/** Dollars in: a budget or a goal. */
export function formatDollars(dollars: number): string {
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Cents in: a price, a payment, a balance. */
export function formatCents(cents: number): string {
  return formatDollars(cents / 100);
}

/** A stated currency in major units, as used by an applicant's rate
 * proposal. Dollar amounts retain the app's existing display convention. */
export function formatCurrency(amount: number, currency: string): string {
  if (currency === "USD") return formatDollars(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}
