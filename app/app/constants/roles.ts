// Shared role picker copy — used in the waitlist follow-up.
export const ROLES = [
  {
    value: "creative" as const,
    label: "Creative",
    description: "Make something, get credit, find collaborators.",
  },
  {
    value: "patron" as const,
    label: "Patron",
    description: "Support creatives whose work you believe in.",
  },
  {
    value: "partner" as const,
    label: "Partner",
    description: "Offer space, gear, or resources to the community.",
  },
];
export type Role = (typeof ROLES)[number]["value"];

/** The onboarding screen's three doors, in the person's own words (Rick,
 *  2026-10-10: ask the role again, and make the question inviting). */
export const DOORS: { role: Role; label: string; hint: string }[] = [
  { role: "creative", label: "I make things", hint: "Share what you're working on." },
  { role: "patron", label: "I back creatives", hint: "Find work worth supporting." },
  { role: "partner", label: "I have a space or resources", hint: "Venues, gear, know-how." },
];

/** What a partner can offer the community. */
export const PARTNER_OFFERINGS = [
  "Venue / space",
  "Equipment / gear",
  "Funding",
  "Mentorship / expertise",
  "Audience / promotion",
  "Other",
];
