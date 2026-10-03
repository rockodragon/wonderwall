import { expect, test, type Page } from "@playwright/test";

const create = "garden/tables:createTable";
const join = "garden/tables:joinTable";
const checkout = "garden/stripe:createTableCheckout";
const guest = "garden/eventRsvps:rsvpGuestToTableEvent";
const approve = "garden/tables:manageEnrollment";
const attendance = "garden/tables:recordAttendance";
const addEvent = "garden/tables:addTableEvent";

async function fixture(page: Page, url: string) {
  const unexpectedTransports: string[] = [];
  page.on("websocket", (socket) => {
    if (/convex\.(cloud|site)/.test(socket.url()))
      unexpectedTransports.push(socket.url());
  });
  page.on("request", (request) => {
    if (/convex\.(cloud|site)|api\.stripe\.com/.test(request.url()))
      unexpectedTransports.push(request.url());
  });
  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.tablesFixture));
  return unexpectedTransports;
}
async function fillBasics(page: Page) {
  await page
    .getByLabel("Title", { exact: true })
    .fill("Browser-tested gathering");
  await page
    .getByLabel("Description", { exact: true })
    .fill("We gather to create together in this isolated browser fixture.");
  await page.getByLabel("Date and start time").first().fill("2099-10-20T18:00");
  await page
    .getByLabel("City or venue", { exact: true })
    .fill("Pasadena studio");
}
async function payload(page: Page, name: string) {
  await expect
    .poll(() =>
      page.evaluate(
        (operation) =>
          window.tablesFixture.calls.filter((call) => call.name === operation)
            .length,
        name,
      ),
    )
    .toBeGreaterThan(0);
  return page.evaluate(
    (operation) =>
      window.tablesFixture.calls.find((call) => call.name === operation)!.args,
    name,
  );
}

// The actual routes/components run in the browser. Only the transport boundary
// is mocked; clicks, form validation, payload serialization, promises, state,
// router navigation, and privacy rendering all use production client code.
test("personal free one-time hosting submits a canonical in-person Event", async ({
  page,
}) => {
  const transports = await fixture(page, "/tables/new?scenario=free");
  await expect(
    page.getByRole("button", { name: "Manual series", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Fixed one-time price", exact: true }),
  ).toBeDisabled();
  await fillBasics(page);
  await page.evaluate((name) => window.tablesFixture.hold(name), create);
  await page
    .getByRole("button", { name: "Set the Table", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Setting the Table…", exact: true }),
  ).toBeDisabled();
  const args = await payload(page, create);
  expect(args).toMatchObject({
    name: "Browser-tested gathering",
    scheduleType: "one_time",
    pricingType: "free",
    membershipRequired: false,
    allowsExternalGuests: false,
    capacity: 12,
  });
  expect(args.hostOrgId).toBeUndefined();
  expect(args.priceCents).toBeUndefined();
  const events = args.events as {
    title: string;
    datetime: number;
    endTime: number;
    locationType: string;
    location: string;
  }[];
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    title: "Browser-tested gathering",
    locationType: "venue",
    location: "Pasadena studio",
  });
  expect(events[0].endTime - events[0].datetime).toBe(90 * 60_000);
  expect(events[0].datetime).toBeGreaterThan(Date.now());
  await page.evaluate((name) => window.tablesFixture.complete(name), create);
  await expect(
    page.getByRole("heading", {
      name: "Browser-tested gathering",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Event details ↗", exact: true }),
  ).toHaveAttribute("href", "/events/created-event-0");
  expect(transports).toEqual([]);
});

test("paid series hosting requires its selected community and serializes the independent membership gate", async ({
  page,
}) => {
  await fixture(page, "/tables/new?scenario=free");
  await page
    .getByRole("combobox", { name: "Host in", exact: true })
    .selectOption("other-community");
  await expect(
    page.getByRole("button", { name: "Fixed one-time price", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("combobox", { name: "Host in", exact: true })
    .selectOption("fixture-community");
  await expect(
    page.getByRole("button", { name: "Fixed one-time price", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Fixed one-time price", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Manual series", exact: true })
    .click();
  await fillBasics(page);
  await page.getByLabel("Date and start time").nth(1).fill("2099-10-27T18:00");
  await page
    .getByLabel("Price in USD, covering all included Events")
    .fill("25.50");
  await page.getByLabel("Require membership in Member studio").check();
  await expect(page.getByLabel(/Allow external guests to RSVP/)).toBeDisabled();
  // Changing to a community the host does not belong to cannot submit the
  // already-selected paid/series configuration, even though its fields remain.
  await page
    .getByRole("combobox", { name: "Host in", exact: true })
    .selectOption("other-community");
  await expect(
    page.getByRole("button", { name: "Set the Table", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("combobox", { name: "Host in", exact: true })
    .selectOption("fixture-community");
  await page.getByLabel("Require membership in Member studio").check();
  await page
    .getByRole("button", { name: "Set the Table", exact: true })
    .click();
  const args = await payload(page, create);
  expect(args).toMatchObject({
    hostOrgId: "fixture-community",
    scheduleType: "series",
    pricingType: "fixed",
    priceCents: 2550,
    membershipRequired: true,
    allowsExternalGuests: false,
  });
  expect(args.events).toHaveLength(2);
});

test("free join remains private during the mutation and reveals the server-authorized roster afterward", async ({
  page,
}) => {
  await fixture(page, "/tables/fixture-gathering?scenario=free");
  await expect(page.getByText(/The roster is private\./)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Accepted participant", exact: true }),
  ).toHaveCount(0);
  await page.evaluate((name) => window.tablesFixture.hold(name), join);
  await page
    .getByRole("button", { name: "Pull Up a Chair", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Saving…", exact: true }),
  ).toBeDisabled();
  expect(await payload(page, join)).toEqual({ tableId: "fixture-table" });
  await expect(page.getByText(/The roster is private\./)).toBeVisible();
  await page.evaluate((name) => window.tablesFixture.complete(name), join);
  await expect(
    page.getByText("You have a chair.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Accepted participant", exact: true }),
  ).toHaveAttribute("href", "/profile/participant-profile");
});

test("failed join reports the error and keeps roster access closed", async ({
  page,
}) => {
  await fixture(page, "/tables/fixture-gathering?scenario=free");
  await page.evaluate((name) => window.tablesFixture.hold(name), join);
  await page
    .getByRole("button", { name: "Pull Up a Chair", exact: true })
    .click();
  await payload(page, join);
  await page.evaluate(
    (name) =>
      window.tablesFixture.fail(
        name,
        "No chairs remain. Please try another Table.",
      ),
    join,
  );
  await expect(page.getByRole("alert")).toContainText("No chairs remain");
  await expect(
    page.getByRole("button", { name: "Pull Up a Chair", exact: true }),
  ).toBeEnabled();
  await expect(page.getByText(/The roster is private\./)).toBeVisible();
});

test("paid checkout uses the Table action and cannot reveal the roster while checkout is pending", async ({
  page,
}) => {
  const transports = await fixture(
    page,
    "/tables/fixture-gathering?scenario=paid",
  );
  await page.evaluate((name) => window.tablesFixture.hold(name), checkout);
  await page
    .getByRole("button", { name: "Pull Up a Chair · $25.00", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Opening checkout…", exact: true }),
  ).toBeDisabled();
  expect(await payload(page, checkout)).toEqual({ tableId: "fixture-table" });
  await expect(page.getByText(/The roster is private\./)).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.tablesFixture.calls.some(
        (call) => call.name === "garden/stripe:createClassCheckout",
      ),
    ),
  ).toBe(false);
  await page.evaluate((name) => window.tablesFixture.complete(name), checkout);
  await expect(page).toHaveURL(/\/checkout-target$/);
  await expect(
    page.getByText("Mock checkout opened", { exact: true }),
  ).toBeVisible();
  expect(transports).toEqual([]);
});

test("a payment return URL does not unlock identities before payment confirmation arrives", async ({
  page,
}) => {
  await fixture(page, "/tables/fixture-gathering?scenario=paid&paid=1");
  await expect(page.getByText(/We're confirming your payment\./)).toBeVisible();
  await expect(page.getByText(/The roster is private\./)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Accepted participant", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => window.tablesFixture.confirmPayment());
  await expect(
    page.getByRole("link", { name: "Accepted participant", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/We're confirming your payment\./)).toHaveCount(
    0,
  );
});

test("external guest submits an Event RSVP without Table enrollment or roster access", async ({
  page,
}) => {
  const transports = await fixture(
    page,
    "/tables/fixture-gathering?scenario=guest",
  );
  await page
    .getByRole("button", { name: "RSVP as an external guest", exact: true })
    .click();
  await page.getByLabel("Your name", { exact: true }).fill("Guest participant");
  await page.getByLabel("Email", { exact: true }).fill("guest@example.test");
  await page.evaluate((name) => window.tablesFixture.hold(name), guest);
  await page
    .getByRole("button", { name: "Confirm guest RSVP", exact: true })
    .click();
  expect(await payload(page, guest)).toEqual({
    eventId: "fixture-event",
    name: "Guest participant",
    email: "guest@example.test",
  });
  await expect(
    page.getByRole("button", { name: "Saving…", exact: true }),
  ).toBeDisabled();
  await page.evaluate((name) => window.tablesFixture.complete(name), guest);
  await expect(
    page.getByText(
      "You're on the guest list for this Event. The Table roster stays private.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText(/The roster is private\./)).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.tablesFixture.calls.some(
        (call) => call.name === "garden/tables:joinTable",
      ),
    ),
  ).toBe(false);
  expect(transports).toEqual([]);
});

test("host acceptance and attendance send separate canonical operations", async ({
  page,
}) => {
  await fixture(page, "/tables/fixture-gathering?scenario=host");
  const management = page.getByRole("region", {
    name: "Host management",
    exact: true,
  });
  await expect(
    management.getByRole("button", { name: "Accept request", exact: true }),
  ).toBeVisible();
  await page.evaluate((name) => window.tablesFixture.hold(name), approve);
  await management
    .getByRole("button", { name: "Accept request", exact: true })
    .click();
  expect(await payload(page, approve)).toEqual({
    tableId: "fixture-table",
    userId: "request-user",
    decision: "accept",
  });
  await expect(
    management.getByRole("button", { name: "Accept request", exact: true }),
  ).toBeDisabled();
  await page.evaluate((name) => window.tablesFixture.complete(name), approve);
  await expect(
    management.getByRole("button", { name: "Accept request", exact: true }),
  ).toHaveCount(0);
  const participantAttendance = management
    .locator(".tables-session")
    .filter({ hasText: "Requesting participant" })
    .filter({
      has: page.getByRole("button", { name: "Attended", exact: true }),
    });
  await expect(
    participantAttendance.getByText("Not recorded", { exact: true }),
  ).toBeVisible();
  await participantAttendance
    .getByRole("button", { name: "Attended", exact: true })
    .click();
  expect(await payload(page, attendance)).toEqual({
    eventId: "fixture-event",
    userId: "request-user",
    status: "attended",
  });
  await expect(
    participantAttendance.getByRole("button", {
      name: "Attended",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("host can append a manually scheduled canonical Event", async ({
  page,
}) => {
  await fixture(page, "/tables/fixture-gathering?scenario=host");
  await page
    .getByRole("button", { name: "+ Add an Event", exact: true })
    .click();
  await page.getByLabel("Title", { exact: true }).fill("Follow-up gathering");
  await page
    .getByLabel("Date and time", { exact: true })
    .fill("2099-10-27T18:00");
  await page
    .getByLabel("City or venue label", { exact: true })
    .fill("Pasadena studio");
  await page.getByRole("button", { name: "Add Event", exact: true }).click();
  const args = await payload(page, addEvent);
  expect(args).toMatchObject({
    tableId: "fixture-table",
    event: {
      title: "Follow-up gathering",
      locationType: "venue",
      location: "Pasadena studio",
    },
  });
  await expect(
    page.getByText("Event added to this Table's schedule.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Event details ↗", exact: true }),
  ).toHaveCount(2);
});
