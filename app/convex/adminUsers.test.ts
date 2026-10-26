// The admin members list (admin.getAllUsersWithInvites): it shows how to
// reach each person (phone as well as email — a phone sign-up has no email)
// and flags an account that never gave a name, which other members don't
// see (convex/names.ts).

import { describe, expect, it } from "vitest";
import { makeCtx, run } from "../test-support/convexContext";
import { getAllUsersWithInvites } from "./admin";

const ADMIN = "users:admin";
const BY_EMAIL = "users:email";
const BY_PHONE = "users:phone";
const BOTH = "users:both";

const world = () => ({
  users: [
    { _id: ADMIN, email: "ada@example.com" },
    { _id: BY_EMAIL, email: "dana@example.com" },
    { _id: BY_PHONE, phone: "+16195550100" },
    { _id: BOTH, email: "max@example.com", phone: "+16195550101" },
  ],
  profiles: [
    { _id: "profiles:admin", userId: ADMIN, name: "Ada Admin", isAdmin: true, createdAt: 4 },
    { _id: "profiles:email", userId: BY_EMAIL, name: "Dana Reyes", createdAt: 3 },
    { _id: "profiles:phone", userId: BY_PHONE, name: "New User", createdAt: 2 },
    { _id: "profiles:both", userId: BOTH, name: "  new user ", createdAt: 1 },
  ],
});

async function rows() {
  const list = await run(getAllUsersWithInvites, makeCtx(world(), ADMIN));
  return (userId: string) => list.find((r: { userId: string }) => r.userId === userId);
}

describe("getAllUsersWithInvites: contact", () => {
  it("a phone-only sign-up has its phone and no email", async () => {
    const row = (await rows())(BY_PHONE);
    expect(row.phone).toBe("+16195550100");
    expect(row.email).toBeUndefined();
  });

  it("an email sign-up has its email and no phone", async () => {
    const row = (await rows())(BY_EMAIL);
    expect(row.email).toBe("dana@example.com");
    expect(row.phone).toBeUndefined();
  });

  it("someone with both shows both", async () => {
    const row = (await rows())(BOTH);
    expect(row.email).toBe("max@example.com");
    expect(row.phone).toBe("+16195550101");
  });
});

describe("getAllUsersWithInvites: unfinished signups", () => {
  it("flags an account still on the placeholder name, any case or padding", async () => {
    const find = await rows();
    expect(find(BY_PHONE).unfinished).toBe(true);
    expect(find(BOTH).unfinished).toBe(true);
  });

  it("doesn't flag someone who has named themselves", async () => {
    const find = await rows();
    expect(find(BY_EMAIL).unfinished).toBe(false);
    expect(find(ADMIN).unfinished).toBe(false);
  });

  it("flags a blank name too", async () => {
    const tables = world();
    tables.profiles[1].name = "";
    const list = await run(getAllUsersWithInvites, makeCtx(tables, ADMIN));
    expect(list.find((r: { userId: string }) => r.userId === BY_EMAIL).unfinished).toBe(true);
  });

  it("still lists unfinished accounts (admins see everyone), newest first", async () => {
    const list = await run(getAllUsersWithInvites, makeCtx(world(), ADMIN));
    expect(list.map((r: { userId: string }) => r.userId)).toEqual([ADMIN, BY_EMAIL, BY_PHONE, BOTH]);
  });
});

describe("getAllUsersWithInvites: who may ask", () => {
  it("refuses a member who isn't an admin", async () => {
    await expect(run(getAllUsersWithInvites, makeCtx(world(), BY_EMAIL))).rejects.toThrow();
  });
});
