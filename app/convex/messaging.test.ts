import { describe, expect, it } from "vitest";
import {
  PEOPLE_TO_MESSAGE_LIMIT,
  normalizePeopleQuery,
  rankPeopleToMessage,
} from "./messaging";

const person = (userId: string, name: string) => ({ userId, name });

const ME = "me";
const none = new Set<string>();

const rank = (
  over: Partial<Parameters<typeof rankPeopleToMessage<{ userId: string; name: string }>>[0]> & {
    query: string;
  },
) =>
  rankPeopleToMessage({
    followed: [],
    members: [],
    selfUserId: ME,
    blockedUserIds: none,
    ...over,
  });

const names = (rows: { name: string }[]) => rows.map((r) => r.name);

describe("normalizePeopleQuery", () => {
  it("trims and lowercases", () => {
    expect(normalizePeopleQuery("  Mar  ")).toBe("mar");
    expect(normalizePeopleQuery("   ")).toBe("");
  });
});

describe("rankPeopleToMessage: nothing typed", () => {
  const followed = [person("a", "Ana"), person("b", "Ben"), person("c", "Cy")];

  it("returns the people you follow in the order given, all marked following", () => {
    const rows = rank({ query: "", followed, members: [person("z", "Zed")] });
    expect(names(rows)).toEqual(["Ana", "Ben", "Cy"]);
    expect(rows.every((r) => r.following)).toBe(true);
  });

  it("treats spaces like nothing typed", () => {
    expect(names(rank({ query: "   ", followed }))).toEqual(["Ana", "Ben", "Cy"]);
  });

  it("is empty when you follow nobody, however many members there are", () => {
    expect(rank({ query: "", members: [person("z", "Zed")] })).toEqual([]);
  });

  it("stops at eight", () => {
    const many = Array.from({ length: 12 }, (_, i) => person(`u${i}`, `Person ${i}`));
    const rows = rank({ query: "", followed: many });
    expect(rows).toHaveLength(PEOPLE_TO_MESSAGE_LIMIT);
    expect(rows[0].name).toBe("Person 0");
    expect(rows[7].name).toBe("Person 7");
  });

  it("keeps the extra fields the caller attached", () => {
    const rows = rankPeopleToMessage({
      followed: [{ userId: "a", name: "Ana", profileId: "p1" }],
      members: [],
      query: "",
      selfUserId: ME,
      blockedUserIds: none,
    });
    expect(rows).toEqual([{ userId: "a", name: "Ana", profileId: "p1", following: true }]);
  });
});

describe("rankPeopleToMessage: who is never offered", () => {
  it("leaves out yourself, blocked people, blanks and the New User placeholder", () => {
    const followed = [
      person(ME, "Me Myself"),
      person("b", "Blocked Bob"),
      person("n", "New User"),
      person("n2", "  new user "),
      person("e", "   "),
      person("ok", "Okay Olive"),
    ];
    const members = [person(ME, "Me Again"), person("b2", "Blocked Beth"), person("m", "Okay Omar")];
    const blockedUserIds = new Set(["b", "b2"]);
    expect(names(rank({ query: "", followed, blockedUserIds }))).toEqual(["Okay Olive"]);
    expect(names(rank({ query: "o", followed, members, blockedUserIds }))).toEqual(["Okay Olive"]);
    expect(names(rank({ query: "ok", followed, members, blockedUserIds }))).toEqual([
      "Okay Olive",
      "Okay Omar",
    ]);
  });

  it("lists a person once even when two rows point at them", () => {
    const rows = rank({
      query: "an",
      followed: [person("a", "Ana"), person("a", "Ana")],
      members: [person("a", "Ana")],
    });
    expect(names(rows)).toEqual(["Ana"]);
    expect(rows[0].following).toBe(true);
  });
});

describe("rankPeopleToMessage: one character", () => {
  it("narrows the people you follow and does not look at other members", () => {
    const followed = [person("a", "Ana"), person("b", "Ben"), person("c", "Cy")];
    const members = [person("z", "Nat")];
    expect(names(rank({ query: "n", followed, members }))).toEqual(["Ana", "Ben"]);
  });
});

describe("rankPeopleToMessage: two or more characters", () => {
  const followed = [person("f1", "Tamara Lee"), person("f2", "Maria Gomez"), person("f3", "Joe Cho")];
  const members = [person("m1", "Marcus Hill"), person("m2", "Summer Vance"), person("m3", "Ann Park")];

  it("puts followed matches first, then other members, and marks which is which", () => {
    const rows = rank({ query: "mar", followed, members });
    expect(rows.map((r) => [r.name, r.following])).toEqual([
      ["Maria Gomez", true],
      ["Tamara Lee", true],
      ["Marcus Hill", false],
    ]);
  });

  it("matches anywhere in the name without regard to case", () => {
    const rows = rank({ query: "MER", followed, members });
    expect(names(rows)).toEqual(["Summer Vance"]);
    expect(rows[0].following).toBe(false);
  });

  it("ranks a name that starts with it, then a word that starts with it, then the rest", () => {
    const rows = rank({
      query: "lee",
      followed: [person("a", "Ashlee Rae"), person("b", "Tamara Lee"), person("c", "Lee Cooper")],
    });
    expect(names(rows)).toEqual(["Lee Cooper", "Tamara Lee", "Ashlee Rae"]);
  });

  it("keeps the follow order inside a rank for people you follow", () => {
    const rows = rank({
      query: "jo",
      followed: [person("a", "Jon B"), person("b", "Joan A"), person("c", "Jo C")],
    });
    expect(names(rows)).toEqual(["Jon B", "Joan A", "Jo C"]);
  });

  it("sorts other members A to Z inside a rank", () => {
    const rows = rank({
      query: "jo",
      members: [person("a", "Jon B"), person("b", "joan A"), person("c", "Jo C")],
    });
    expect(names(rows)).toEqual(["Jo C", "joan A", "Jon B"]);
  });

  it("ignores spaces around the text", () => {
    expect(names(rank({ query: "  mar ", followed, members }))).toEqual([
      "Maria Gomez",
      "Tamara Lee",
      "Marcus Hill",
    ]);
  });

  it("does not offer a followed person twice when they are also in the members list", () => {
    const rows = rank({ query: "maria", followed, members: [...members, person("f2", "Maria Gomez")] });
    expect(names(rows)).toEqual(["Maria Gomez"]);
    expect(rows[0].following).toBe(true);
  });

  it("returns nobody when nothing matches", () => {
    expect(rank({ query: "zzz", followed, members })).toEqual([]);
  });

  it("caps the total at eight, followed people first", () => {
    const manyFollowed = Array.from({ length: 5 }, (_, i) => person(`f${i}`, `Sam F${i}`));
    const manyMembers = Array.from({ length: 10 }, (_, i) => person(`m${i}`, `Sam M${String(i).padStart(2, "0")}`));
    const rows = rank({ query: "sam", followed: manyFollowed, members: manyMembers });
    expect(rows).toHaveLength(PEOPLE_TO_MESSAGE_LIMIT);
    expect(rows.slice(0, 5).every((r) => r.following)).toBe(true);
    expect(rows.slice(5).every((r) => !r.following)).toBe(true);
    expect(names(rows.slice(5))).toEqual(["Sam M00", "Sam M01", "Sam M02"]);
  });

  it("honors a smaller limit", () => {
    expect(rank({ query: "ma", followed, members, limit: 2 })).toHaveLength(2);
  });
});
