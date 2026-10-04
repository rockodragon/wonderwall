import { useSyncExternalStore } from "react";
import {
  getFunctionName,
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
} from "convex/server";

// Test-only API double. Client routes/components and event handlers are real.
// No Convex transport, Stripe request, or production data is involved.
type Call = { name: string; args: Record<string, unknown> };
type Occurrence = {
  title: string;
  datetime: number;
  endTime?: number;
  location?: string;
  locationType?: string;
};
type Person = {
  userId: string;
  name: string;
  status: string;
  role: string;
  paymentStatus: string;
};
type Attendance = { userId: string; status: string; eventId: string };

const scenario =
  new URLSearchParams(window.location.search).get("scenario") ?? "free";
// "host" hosts a series; "host-once" hosts a one-time Table.
const hosting = scenario === "host" || scenario === "host-once";
let version = 0;
const listeners = new Set<() => void>();
const calls: Call[] = [];
const held = new Set<string>();
const pending = new Map<
  string,
  { resolve: () => void; reject: (error: Error) => void }[]
>();
const emit = () => {
  version++;
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => version;
const tableId = "fixture-table";
const communityId = "fixture-community";
const communities = [
  {
    _id: communityId,
    name: "Member studio",
    slug: "member-studio",
    canHostPaidOrSeries: true,
  },
  {
    _id: "other-community",
    name: "Other studio",
    slug: "other-studio",
    canHostPaidOrSeries: false,
  },
];
const myCommunities = communities.map((community) => ({
  ...community,
  status: "active",
  role: "member",
  isHome: false,
}));
let people: Person[] =
  hosting
    ? [
        {
          userId: "host-user",
          name: "Fixture host",
          status: "active",
          role: "host",
          paymentStatus: "not_required",
        },
        {
          userId: "request-user",
          name: "Requesting participant",
          status: "pending",
          role: "participant",
          paymentStatus: "not_required",
        },
      ]
    : [];
let attendance: Attendance[] = [];
let table = {
  _id: tableId,
  name: "Fixture gathering",
  slug: "fixture-gathering",
  format: "Writing",
  topic: "Writing",
  description: "An isolated browser test gathering.",
  blurb: "An isolated browser test gathering.",
  photoUrl: undefined as string | undefined,
  memberCount: 1,
  capacity: 12,
  spotsRemaining: 11,
  scheduleType: scenario === "host" ? "series" : "one_time",
  previousTableId: undefined as string | undefined,
  pricingType: scenario === "paid" ? "fixed" : "free",
  priceCents: scenario === "paid" ? 2500 : (undefined as number | undefined),
  membershipRequired: false,
  allowsExternalGuests: scenario === "guest",
  access: "open",
  host: { name: "Fixture host", userId: "host-user", profileId: "host-profile" },
  hostRoleLabel: "Hosted",
  community: { name: "Member studio", slug: "member-studio" } as { name: string; slug: string } | null,
  events: [
    {
      _id: "fixture-event",
      title: "First gathering",
      datetime: Date.parse("2099-10-20T18:00:00-07:00"),
      location: "Pasadena",
      locationType: "venue",
    } as Occurrence & { _id: string },
  ],
  sessions: [] as never[],
  roster: [] as string[],
  rosterProfiles: [] as { userId: string; profileId: string; name: string }[],
  viewer: {
    isMember: false,
    isHost: hosting,
    canSeeRoster: hosting,
    canGuestRsvp: scenario === "guest",
    action:
      scenario === "paid"
        ? "checkout"
        : hosting
          ? "joined"
          : scenario === "guest"
            ? "sign_in"
            : "join",
    reason: undefined as string | undefined,
  },
};

function activateParticipant() {
  table = {
    ...table,
    roster: ["Accepted participant"],
    rosterProfiles: [
      {
        userId: "participant",
        profileId: "participant-profile",
        name: "Accepted participant",
      },
    ],
    viewer: {
      ...table.viewer,
      isMember: true,
      canSeeRoster: true,
      action: "joined",
    },
  };
  emit();
}

export interface TablesFixtureControls {
  calls: Call[];
  hold(name: string): void;
  complete(name: string): void;
  fail(name: string, message: string): void;
  confirmPayment(): void;
  setAction(action: string, reason?: string): void;
}
declare global {
  interface Window {
    tablesFixture: TablesFixtureControls;
  }
}
window.tablesFixture = {
  calls,
  hold(name) {
    held.add(name);
  },
  complete(name) {
    held.delete(name);
    const waiting = pending.get(name) ?? [];
    pending.delete(name);
    waiting.forEach((waiter) => waiter.resolve());
  },
  fail(name, message) {
    held.delete(name);
    const waiting = pending.get(name) ?? [];
    pending.delete(name);
    // A server refusal carries its reason on data, as ConvexError does.
    waiting.forEach((waiter) =>
      waiter.reject(Object.assign(new Error(message), { data: { reason: message } })),
    );
  },
  confirmPayment: activateParticipant,
  setAction(action, reason) {
    table = { ...table, viewer: { ...table.viewer, action, reason } };
    emit();
  },
};

async function invoke(name: string, args: Record<string, unknown>) {
  calls.push({ name, args });
  if (held.has(name))
    await new Promise<void>((resolve, reject) => {
      const waiters = pending.get(name) ?? [];
      waiters.push({ resolve, reject });
      pending.set(name, waiters);
    });
  switch (name) {
    case "garden/tables:createTable": {
      const events = (args.events as Occurrence[]).map((event, index) => ({
        ...event,
        _id: `created-event-${index}`,
      }));
      table = {
        ...table,
        name: String(args.name),
        slug: "created-table",
        description: String(args.description),
        format: String(args.format),
        scheduleType: String(args.scheduleType),
        pricingType: String(args.pricingType),
        membershipRequired: args.membershipRequired === true,
        priceCents: args.priceCents as number | undefined,
        events,
        viewer: {
          ...table.viewer,
          action: "joined",
          isHost: true,
          canSeeRoster: true,
        },
      };
      emit();
      return {
        tableId,
        slug: "created-table",
        eventIds: events.map((event) => event._id),
      };
    }
    case "garden/tables:joinTable":
      activateParticipant();
      return { ok: true, action: "joined" };
    case "garden/tables:leaveTable":
      table = {
        ...table,
        roster: [],
        rosterProfiles: [],
        viewer: {
          ...table.viewer,
          isMember: false,
          canSeeRoster: false,
          action: "join",
        },
      };
      emit();
      return { ok: true };
    // The fixture returns an internal demo route. No payment provider is called.
    case "garden/stripe:createTableCheckout":
      return { url: "/checkout-target" };
    case "garden/eventRsvps:rsvpGuestToTableEvent":
      return { ok: true };
    case "garden/tables:manageEnrollment": {
      people = people.map((person) =>
        person.userId === args.userId
          ? {
              ...person,
              status: args.decision === "accept" ? "active" : "removed",
            }
          : person,
      );
      emit();
      return { ok: true };
    }
    case "garden/tables:recordAttendance":
      attendance = [
        ...attendance.filter((entry) => entry.userId !== args.userId),
        {
          userId: String(args.userId),
          eventId: String(args.eventId),
          status: String(args.status),
        },
      ];
      emit();
      return { ok: true };
    case "garden/tables:addTableEvent": {
      const event = { ...(args.event as Occurrence), _id: "added-event" };
      table = { ...table, scheduleType: "series", events: [...table.events, event] };
      emit();
      return { eventId: event._id, scheduleType: "series", notified: 2 };
    }
    case "garden/tables:runTableAgain": {
      const event = { ...(args.event as Occurrence), _id: "again-event" };
      table = {
        ...table,
        slug: "fixture-gathering-2",
        scheduleType: "one_time",
        previousTableId: tableId,
        events: [event],
      };
      emit();
      return {
        tableId: "fixture-table-2",
        slug: "fixture-gathering-2",
        eventIds: [event._id],
        invited: 3,
      };
    }
    default:
      throw new Error(`Unconfigured fixture operation: ${name}`);
  }
}

export function useConvexAuth() {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  return { isAuthenticated: scenario !== "guest", isLoading: false };
}
export function useQuery<Query extends FunctionReference<"query">>(
  reference: Query,
  args?: FunctionArgs<Query> | "skip",
): FunctionReturnType<Query> | undefined {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  if (args === "skip") return undefined;
  const name = getFunctionName(reference);
  let result: unknown;
  switch (name) {
    case "garden/tables:getCreatorPolicy":
      result = {
        signedIn: true,
        canCreateFreeOneTime: true,
        canCreatePaidOrSeries:
          (args as { hostOrgId?: string } | undefined)?.hostOrgId ===
          communityId,
        communities,
      };
      break;
    case "garden/communities:listMyCommunities":
      result = myCommunities;
      break;
    case "garden/tables:getTable":
      result = table;
      break;
    case "garden/tables:listTables":
    case "garden/tables:listMyTables":
      result = [table];
      break;
    case "garden/tables:getHostRoster":
      result = people;
      break;
    case "garden/tables:getAttendance":
      result = attendance;
      break;
    // Host-only on the server; the page asks only when hosting.
    case "garden/tables:getTableGuests":
      result = hosting
        ? [
            {
              rsvpId: "fixture-guest-rsvp",
              eventId: "fixture-event",
              eventTitle: "First gathering",
              datetime: Date.parse("2099-10-20T18:00:00-07:00"),
              name: "Guest participant",
              email: "guest@example.test",
              phone: "+16195550100",
              wantsNewDates: true,
            },
          ]
        : [];
      break;
    default:
      throw new Error(`Unconfigured fixture query: ${name}`);
  }
  return result as FunctionReturnType<Query>;
}
export function useMutation<Mutation extends FunctionReference<"mutation">>(
  reference: Mutation,
) {
  return async (
    args: FunctionArgs<Mutation>,
  ): Promise<FunctionReturnType<Mutation>> =>
    invoke(getFunctionName(reference), args) as Promise<
      FunctionReturnType<Mutation>
    >;
}
export function useAction<Action extends FunctionReference<"action">>(
  reference: Action,
) {
  return async (
    args: FunctionArgs<Action>,
  ): Promise<FunctionReturnType<Action>> =>
    invoke(getFunctionName(reference), args) as Promise<
      FunctionReturnType<Action>
    >;
}
