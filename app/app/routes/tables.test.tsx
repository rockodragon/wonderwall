import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, RouterProvider, createMemoryRouter } from "react-router";
import TablesIndex from "./tables._index";
import TableDetailPage, { ParticipationState } from "./tables.$slug";
import NewTablePage from "./tables.new";

const state = vi.hoisted(() => ({
  signedIn: false,
  queries: {} as Record<string, unknown>,
}));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useConvexAuth: () => ({
      isAuthenticated: state.signedIn,
      isLoading: false,
    }),
    useQuery: (
      reference: Parameters<typeof getFunctionName>[0],
      args?: unknown,
    ) =>
      args === "skip" ? undefined : state.queries[getFunctionName(reference)],
    useMutation: () => async () => ({ ok: true }),
    useAction: () => async () => ({ url: "https://checkout.stripe.com/test" }),
  };
});

const card = {
  _id: "table1",
  name: "Our creative studio",
  slug: "our-studio",
  format: "Writing",
  memberCount: 3,
  capacity: 10,
  scheduleType: "one_time",
  membershipRequired: false,
  priceCents: undefined,
  host: { name: "Marta", userId: "host1", profileId: "host-profile" },
  community: null,
};
const detail = {
  ...card,
  description: "A place to create together.",
  events: [
    {
      _id: "event1",
      title: "First gathering",
      datetime: Date.UTC(2026, 9, 20, 18),
      location: "Community studio",
      locationType: "in_person",
    },
  ],
  sessions: [],
  roster: [],
  rosterProfiles: [],
  viewer: {
    isMember: false,
    isHost: false,
    action: "sign_in",
    canSeeRoster: false,
    canGuestRsvp: false,
  },
};
const render = (url: string) =>
  renderToStaticMarkup(
    <RouterProvider
      router={createMemoryRouter(
        [
          { path: "/tables", Component: TablesIndex },
          { path: "/tables/new", Component: NewTablePage },
          { path: "/tables/:slug", Component: TableDetailPage },
        ],
        { initialEntries: [url] },
      )}
    />,
  );

beforeEach(() => {
  state.signedIn = false;
  state.queries = {
    "garden/tables:listTables": [card],
    "garden/tables:getTable": detail,
    "garden/communities:listMyCommunities": [],
  };
});

describe("Tables browse and creation routes", () => {
  it("presents real platform Tables and navigates to creation", () => {
    const markup = render("/tables");
    expect(markup).toContain("Find a Table");
    expect(markup).toContain('href="/tables/our-studio"');
    expect(markup).toContain('href="/tables/new"');
    expect(markup).not.toContain("Psalms for Poets");
    expect(markup).not.toContain("Spaces are coming");
  });
  it("gates Your Tables with a login return destination", () => {
    const markup = render("/tables?view=mine");
    expect(markup).toContain("Sign in to see the Tables");
    expect(markup).toContain("redirect=%2Ftables%3Fview%3Dmine");
    expect(markup).not.toContain("Our creative studio");
  });
  it("renders only the user's returned memberships/hosted Tables in Your Tables", () => {
    state.signedIn = true;
    state.queries["garden/tables:listMyTables"] = [
      { ...card, name: "My real Table", slug: "my-real-table" },
    ];
    const markup = render("/tables?view=mine");
    expect(markup).toContain("My real Table");
    expect(markup).not.toContain("Our creative studio");
  });
  it("preserves the creation intent on sign-in", () => {
    expect(render("/tables/new")).toContain(
      'href="/login?redirect=%2Ftables%2Fnew"',
    );
  });
  it("allows free one-time hosting but disables commercial/series options for a free account", () => {
    state.signedIn = true;
    state.queries["garden/tables:getCreatorPolicy"] = {
      signedIn: true,
      canCreateFreeOneTime: true,
      canCreatePaidOrSeries: false,
      communities: [],
    };
    const markup = render("/tables/new");
    expect(markup).toContain("As myself · independent Table");
    expect(markup).toMatch(/disabled="">Manual series/);
    expect(markup).toMatch(/disabled="">Fixed one-time price/);
    expect(markup).toContain("Set the Table");
    expect(markup).not.toContain("Pay what you can");
  });
});

describe("Table detail server projection", () => {
  it("withholds roster identities and links for an unjoined viewer", () => {
    const markup = render("/tables/our-studio");
    expect(markup).toContain("The roster is private");
    expect(markup).not.toContain("tables-roster-person");
    expect(markup).toContain('href="/events/event1"');
    expect(markup).toContain("Sign in to pull up a chair");
  });
  it("puts the next gathering and participation before the description and links the real host profile", () => {
    const markup = render("/tables/our-studio");
    expect(markup).toContain('href="/profile/host-profile"');
    expect(markup).toContain('aria-label="Next gathering"');
    expect(markup.indexOf('aria-label="Next gathering"')).toBeLessThan(markup.indexOf('tables-description'));
    expect(markup.indexOf('aria-label="Participation"')).toBeLessThan(markup.indexOf('tables-description'));
    expect(markup).not.toContain("Event details");
    expect(markup).toContain("First gathering ↗");
  });
  it("uses the existing organization host label with separate person and organization links", () => {
    state.queries["garden/tables:getTable"] = {
      ...detail,
      host: { ...detail.host, orgName: "Creative studio", orgSlug: "creative-studio" },
    };
    const markup = render("/tables/our-studio");
    expect(markup).toContain('href="/orgs/creative-studio"');
    expect(markup).toContain('href="/profile/host-profile"');
    expect(markup).toContain("Creative studio");
    expect(markup).not.toContain("Hosted by by");
  });
  it("renders only the permitted roster profile projection", () => {
    state.signedIn = true;
    state.queries["garden/tables:getTable"] = {
      ...detail,
      roster: ["Mara"],
      rosterProfiles: [
        { userId: "user2", profileId: "profile2", name: "Mara" },
      ],
      viewer: {
        ...detail.viewer,
        isMember: true,
        canSeeRoster: true,
        action: "joined",
      },
    };
    const markup = render("/tables/our-studio");
    expect(markup).toContain('href="/profile/profile2"');
    expect(markup).toContain("You have a chair");
    expect(markup).not.toContain("The roster is private");
  });
  it("never activates enrollment or reveals a roster from a successful checkout URL alone", () => {
    const markup = render("/tables/our-studio?paid=1");
    expect(markup).toContain("confirming your payment");
    expect(markup).toContain("The roster is private");
    expect(markup).not.toContain("You have a chair");
  });
  it("offers guest RSVP only when the server allows it", () => {
    expect(render("/tables/our-studio")).not.toContain(
      "RSVP as an external guest",
    );
    state.queries["garden/tables:getTable"] = {
      ...detail,
      viewer: { ...detail.viewer, canGuestRsvp: true },
    };
    expect(render("/tables/our-studio")).toContain("RSVP as an external guest");
  });
  it("gracefully handles missing/private Tables", () => {
    state.queries["garden/tables:getTable"] = null;
    expect(render("/tables/missing")).toContain(
      "We couldn&#x27;t find this Table",
    );
  });
});

describe("participation CTA follows the server action", () => {
  const actionHtml = (action: string, reason?: string) =>
    renderToStaticMarkup(
      <MemoryRouter>
        <ParticipationState
          action={action}
          reason={reason}
          priceCents={6000}
          slug="table"
          pending={false}
          onJoin={() => {}}
          onCheckout={() => {}}
        />
      </MemoryRouter>,
    );
  it.each([
    ["join", "Pull Up a Chair"],
    ["request", "Ask for a chair"],
    ["checkout", "Pull Up a Chair · $60.00"],
    ["joined", "You have a chair"],
    ["full", "This Table is full"],
    ["membership_required", "Membership in this Table"],
  ])("renders %s", (action, expected) =>
    expect(actionHtml(action)).toContain(expected),
  );
  it("closed/full/unavailable states do not offer invented waitlists", () => {
    for (const action of ["full", "closed", "unavailable"]) {
      expect(actionHtml(action)).not.toContain("<button");
      expect(actionHtml(action)).not.toContain("waitlist");
    }
  });
});
