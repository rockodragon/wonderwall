// The crawler's prospect data (crawled organizations with their emails and
// phone numbers) was readable, and the crawl / classify actions runnable, by
// anyone over HTTP: crawlerExport.ts, crawlerScheduler.ts, crawlerSeeds.ts,
// crawlerClassifier.ts, crawlerModelTest.ts and sourceParsers.ts had public
// functions with no sign-in or admin check (found 2026-10-26). No page
// called them, so they are internal now. What's checked here:
//   - every public function in a crawler file refuses a signed-out caller
//     and a signed-in non-admin (a new public one is checked automatically);
//   - the operator's CSV export still comes out right;
//   - csvCell, the one CSV escaper (the guest list's use of it is in
//     eventGuests.test.ts).

import { ConvexError } from "convex/values";
import { getFunctionName } from "convex/server";
import { describe, expect, it } from "vitest";
import { makeCtx, run, type Row } from "../test-support/convexContext";
import { expectSignedOutRefusal } from "../test-support/signedOut";
import { requireAdminForAction } from "./helpers";
import { csvCell } from "./csv";
import * as crawler from "./crawler";
import * as crawlerClassifier from "./crawlerClassifier";
import * as crawlerExport from "./crawlerExport";
import * as crawlerModelTest from "./crawlerModelTest";
import * as crawlerScheduler from "./crawlerScheduler";
import * as crawlerSeeds from "./crawlerSeeds";
import * as jobScraper from "./jobScraper";
import * as sourceParsers from "./sourceParsers";

const ME = "users:me";
const ADMIN = "users:admin";

type Registered = { isPublic?: boolean; isInternal?: boolean; isAction?: boolean };

const MODULES: Record<string, Record<string, unknown>> = {
  crawler,
  crawlerClassifier,
  crawlerExport,
  crawlerModelTest,
  crawlerScheduler,
  crawlerSeeds,
  jobScraper,
  sourceParsers,
};

const REGISTERED = Object.entries(MODULES).flatMap(([mod, exports]) =>
  Object.entries(exports)
    .filter(([, fn]) => typeof fn === "function" && ((fn as Registered).isPublic || (fn as Registered).isInternal))
    .map(([name, fn]) => ({ name: `${mod}.${name}`, fn: fn as Registered })),
);
const PUBLIC = REGISTERED.filter((f) => f.fn.isPublic);

async function refusal(call: Promise<unknown>): Promise<{ code: string; reason: string }> {
  try {
    await call;
  } catch (err) {
    expect(err).toBeInstanceOf(ConvexError);
    return (err as ConvexError<any>).data;
  }
  throw new Error("expected the call to be refused");
}

/** A signed-in member who isn't an admin. An action checks admin through
 * ctx.runQuery(internal.helpers.requireAdminForAction); that one query is
 * run for real, and any other means the action did something first. */
function memberCtx() {
  const ctx = makeCtx({ profiles: [{ _id: "profiles:me", userId: ME, name: "Me" }] }, ME);
  ctx.runQuery = async (ref: any, args: Record<string, unknown>) => {
    const name = getFunctionName(ref);
    if (name !== "helpers:requireAdminForAction") throw new Error(`ran ${name} before the admin check`);
    return run(requireAdminForAction, ctx, args);
  };
  ctx.runMutation = async (ref: any) => {
    throw new Error(`ran ${getFunctionName(ref)} before the admin check`);
  };
  ctx.runAction = ctx.runMutation;
  return ctx;
}

describe("public crawler functions are admin-only", () => {
  it("finds the admin page's functions (the sweep isn't empty)", () => {
    const names = PUBLIC.map((f) => f.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "crawler.listOrganizations",
        "crawler.getStats",
        "crawler.startQueueProcessor",
        "jobScraper.scrapeJobsForOrganization",
      ]),
    );
  });

  for (const { name, fn } of PUBLIC) {
    it(`${name}: signed out is refused`, async () => {
      await expectSignedOutRefusal(fn);
    });
    it(`${name}: a signed-in non-admin is refused`, async () => {
      expect((await refusal(run(fn, memberCtx(), {}))).code).toBe("forbidden");
    });
  }

  it("an admin still gets past the gate", async () => {
    const ctx = makeCtx(
      {
        profiles: [{ _id: "profiles:admin", userId: ADMIN, name: "Ada", isAdmin: true }],
        crawledOrganizations: [org("1", { exportedToCrm: true })],
      },
      ADMIN,
    );
    expect(await run(crawler.getStats, ctx)).toMatchObject({ total: 1, hotLeads: 1, exportedCount: 1 });
  });
});

function org(id: string, extra: Partial<Row> = {}): Row {
  return {
    _id: `crawledOrganizations:${id}`,
    name: "Grace Church",
    website: `https://grace${id}.example`,
    sourceUrl: `https://grace${id}.example`,
    industry: "Religious",
    city: "Dallas",
    state: "TX",
    email: `hi@grace${id}.example`,
    phone: "555-0100",
    ownerName: "Pat Lee",
    totalScore: 85,
    segment: "hot",
    status: "new",
    personaTags: ["CHURCH", "MINISTRY"],
    valuesScore: 40,
    hiringScore: 20,
    qualityScore: 15,
    contactScore: 10,
    faithSignals: ["Statement of faith"],
    conservativeSignals: [],
    description: "A church in Dallas.",
    source: "manual",
    exportedToCrm: false,
    discoveredAt: Date.UTC(2026, 9, 1),
    ...extra,
  };
}

describe("crawlerExport.exportToCSV (operator-only)", () => {
  const HEADER =
    "Name,Website,Industry,City,State,Email,Phone,Contact Name,Total Score,Segment,Status,Persona Tags," +
    "Values Score,Hiring Score,Quality Score,Faith Signals,Description,Source,Discovered Date";

  it("returns the leads not yet exported, newest first, with cells escaped", async () => {
    const ctx = makeCtx(
      {
        crawledOrganizations: [
          org("1"),
          org("2", { exportedToCrm: true }),
          org("3", { name: 'Hope, "The" Chapel', description: "Line one\nLine two", ownerName: undefined }),
        ],
      },
      null,
    );
    const out = await run(crawlerExport.exportToCSV, ctx, {});
    expect(out.count).toBe(2);
    expect(out.filename).toMatch(/^wonderwall-leads-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(out.csv.startsWith(`${HEADER}\n`)).toBe(true);
    const body = out.csv.slice(HEADER.length + 1);
    expect(body).toBe(
      [
        '"Hope, ""The"" Chapel",https://grace3.example,Religious,Dallas,TX,hi@grace3.example,555-0100,,85,hot,new,' +
          'CHURCH; MINISTRY,40,20,15,Statement of faith,"Line one\nLine two",manual,2026-10-01',
        "Grace Church,https://grace1.example,Religious,Dallas,TX,hi@grace1.example,555-0100,Pat Lee,85,hot,new," +
          "CHURCH; MINISTRY,40,20,15,Statement of faith,A church in Dallas.,manual,2026-10-01",
      ].join("\n"),
    );
  });

  it("includes exported rows and filters by score when asked", async () => {
    const ctx = makeCtx(
      { crawledOrganizations: [org("1", { exportedToCrm: true }), org("2", { totalScore: 30 })] },
      null,
    );
    const out = await run(crawlerExport.exportToCSV, ctx, { includeExported: true, minScore: 50 });
    expect(out.count).toBe(1);
    expect(out.csv).toContain("https://grace1.example");
    expect(out.csv).not.toContain("https://grace2.example");
  });
});

describe("csvCell", () => {
  it("leaves a plain value alone and blanks a missing one", () => {
    expect(csvCell("Dallas")).toBe("Dallas");
    expect(csvCell(42)).toBe("42");
    expect(csvCell("")).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(null)).toBe("");
  });

  it("quotes a comma, a quote or a line break, doubling the quotes", () => {
    expect(csvCell("Ann, Ben")).toBe('"Ann, Ben"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("one\ntwo")).toBe('"one\ntwo"');
    expect(csvCell("one\r\ntwo")).toBe('"one\r\ntwo"');
    expect(csvCell("one\rtwo")).toBe('"one\rtwo"');
  });
});
