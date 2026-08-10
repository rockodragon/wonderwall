// The Garden — capability service.
// Implements the entitlement matrix in docs/the-garden-product-plan.md §2.3 verbatim.
// This is the real contract: Phase 1B swaps the demo store for Convex + Stripe
// behind this exact function; UI callers must not change.

export type Level = "visitor" | "free" | "seat" | "five" | "host";

export type Capability =
  | "project.create.passion"
  | "project.create.paid"
  | "project.applyPaid"
  | "pool.propose"
  | "event.create"
  | "table.join.open"
  | "table.join.member"
  | "table.create"
  | "seat.cover"
  | "fellowship.fund"
  | "project.pledge";

export interface GardenUser {
  id: string;
  name: string;
  level: Level;
  /** A covered seat is identical to a seat — only who pays differs. */
  coveredBy?: string;
  patronRole: boolean;
  partnerRole: boolean;
  activePassionProjects: number;
}

export interface CanResult {
  allowed: boolean;
  /** Human sentence for the denial anatomy (G-series mocks). */
  reason?: string;
  limit?: number;
  used?: number;
  /** e.g. "Take a seat — $10/mo". Denials always return the path through. */
  upgradePath?: string;
}

const PASSION_CAPS: Record<Level, number> = {
  visitor: 0,
  free: 0,
  seat: 1,
  five: 5,
  host: 10,
};

const SEAT_PATH = "Take a seat — $10/mo";
const FIVE_PATH = "Five seats — $25/mo";
const HOST_PATH = "Host — $50/mo";

const isPaidLevel = (l: Level) => l === "seat" || l === "five" || l === "host";

export function can(user: GardenUser, capability: Capability): CanResult {
  const level = user.level;

  switch (capability) {
    case "project.create.passion": {
      const limit = PASSION_CAPS[level];
      if (limit === 0)
        return {
          allowed: false,
          reason:
            "Passion projects live on members' seats — they draw on community attention and the project pool.",
          limit,
          used: user.activePassionProjects,
          upgradePath: SEAT_PATH,
        };
      if (user.activePassionProjects >= limit)
        return {
          allowed: false,
          reason: `You're at ${limit} active passion ${limit === 1 ? "project" : "projects"} — finish one, or make room for more.`,
          limit,
          used: user.activePassionProjects,
          upgradePath: level === "seat" ? FIVE_PATH : level === "five" ? HOST_PATH : undefined,
        };
      return { allowed: true, limit, used: user.activePassionProjects };
    }

    case "project.create.paid":
      // Guardrail is the declared budget, not the persona (plan §2.3).
      if (isPaidLevel(level) || user.patronRole || user.partnerRole)
        return { allowed: true };
      return {
        allowed: false,
        reason:
          "Paid projects need a declared budget and a seat, or a patron/partner role.",
        upgradePath: SEAT_PATH,
      };

    case "project.applyPaid":
      if (isPaidLevel(level)) return { allowed: true };
      return {
        allowed: false,
        reason: "Applying to paid work is a member thing — take a seat first.",
        upgradePath: SEAT_PATH,
      };

    case "pool.propose":
      if (isPaidLevel(level)) return { allowed: true };
      return {
        allowed: false,
        reason:
          "The pool is members' dues, reserved for members' work. Patrons and partners direct their own money instead.",
        upgradePath: SEAT_PATH,
      };

    case "event.create":
      if (isPaidLevel(level) || user.partnerRole) return { allowed: true };
      return {
        allowed: false,
        reason: "Putting on an event takes a seat — or a partner listing.",
        upgradePath: SEAT_PATH,
      };

    case "table.join.open":
      return { allowed: true };

    case "table.join.member":
      if (isPaidLevel(level)) return { allowed: true };
      return {
        allowed: false,
        reason: "This table is members-only. A seat gets you a place at it.",
        upgradePath: SEAT_PATH,
      };

    case "table.create":
      if (level === "host") return { allowed: true };
      return {
        allowed: false,
        reason:
          "A Table is a roster that belongs to someone — hosting is its own craft.",
        upgradePath: HOST_PATH,
      };

    case "seat.cover":
    case "fellowship.fund":
    case "project.pledge":
      if (user.patronRole || user.partnerRole) return { allowed: true };
      return {
        allowed: false,
        reason: "Add the patron role to your account — it's free to hold.",
        upgradePath: "Become a patron — free",
      };
  }
}

export const LEVEL_LABEL: Record<Level, string> = {
  visitor: "Visitor",
  free: "Free account",
  seat: "A seat · $10/mo",
  five: "Five seats · $25/mo",
  host: "Host · $50/mo",
};

/** Published splits (plan §2.2) — render these wherever money appears. */
export const SPLITS = {
  dues: { hostOrg: 0.4, pool: 0.5, platform: 0.1 },
  patronage: { work: 0.9, platform: 0.1 },
  duesSentence:
    "Half of every membership funds another creative's project. From day one your money is supporting someone — instead of hoping to hear back.",
} as const;
