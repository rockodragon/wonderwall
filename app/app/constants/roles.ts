// Shared role picker copy — used in onboarding and the waitlist follow-up.
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
