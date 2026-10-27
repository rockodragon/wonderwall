// Finding people and organizations entered twice (duplicateRules.ts), on the
// founder's own examples (2026-10-26): two Sarah Shreves, "Ezekiel Pugal /
// ezthetics", two Rick Moys, "The Grove Center for…", two "BetLynArt …
// Publishing SESAC".

import { describe, expect, it } from "vitest";
import {
  copiesToMerge,
  groupEdges,
  listPhrase,
  normalizeName,
  orgEdges,
  orgsLookAlike,
  pairKey,
  pairKeysOf,
  personEdges,
  personNameKeys,
} from "./duplicateRules";

describe("normalizeName", () => {
  it("ignores case, extra spaces, accents and punctuation", () => {
    expect(normalizeName("  Sarah   SHREVES. ")).toBe("sarah shreves");
    expect(normalizeName("Zoë O'Brien-Smith")).toBe("zoe o brien smith");
    expect(normalizeName("Arts & Media")).toBe("arts and media");
  });
  it("keeps letters of any script", () => {
    expect(normalizeName("  李 小龍 ")).toBe("李 小龍");
  });
});

describe("personNameKeys", () => {
  it("gives the part before a slash as a second key", () => {
    expect(personNameKeys("Ezekiel Pugal / ezthetics")).toEqual([
      { key: "ezekiel pugal ezthetics", reason: "same_name" },
      { key: "ezekiel pugal", reason: "same_name_before_slash" },
    ]);
  });
  it("needs two words before the slash", () => {
    expect(personNameKeys("AC/DC").map((k) => k.key)).toEqual(["ac dc"]);
  });
  it("a sign-up still on the placeholder name matches nothing by name", () => {
    expect(personNameKeys("New User")).toEqual([]);
    expect(personNameKeys("  new user ")).toEqual([]);
    expect(personNameKeys("")).toEqual([]);
  });
});

describe("personEdges", () => {
  const people = [
    { id: "u:sarah1", name: "Sarah Shreves" },
    { id: "u:sarah2", name: "sarah  shreves." },
    { id: "u:zeke1", name: "Ezekiel Pugal / ezthetics" },
    { id: "u:zeke2", name: "Ezekiel Pugal" },
    { id: "u:rick1", name: "Rick Moy", email: "Rick@Example.com" },
    { id: "u:rick2", name: "Rick Moy" },
    { id: "u:other", name: "Dana Reyes", email: "rick@example.com " },
    { id: "u:new1", name: "New User", phone: "+16195550100" },
    { id: "u:new2", name: "New User", phone: "+1 (619) 555-0100" },
    { id: "u:new3", name: "New User" },
  ];
  const edges = personEdges(people);
  const reasonOf = (a: string, b: string) =>
    edges.filter((e) => pairKey(e.a, e.b) === pairKey(a, b)).map((e) => e.reason);

  it("matches the same name, however it's typed", () => {
    expect(reasonOf("u:sarah1", "u:sarah2")).toEqual(["same_name"]);
    expect(reasonOf("u:rick1", "u:rick2")).toEqual(["same_name"]);
  });
  it('matches "Name / something" on the part before the slash', () => {
    expect(reasonOf("u:zeke1", "u:zeke2")).toEqual(["same_name_before_slash"]);
  });
  it("matches the same email or phone, whatever the name", () => {
    expect(reasonOf("u:rick1", "u:other")).toEqual(["same_email"]);
    expect(reasonOf("u:new1", "u:new2")).toEqual(["same_phone"]);
  });
  it("never matches placeholder names to each other", () => {
    expect(reasonOf("u:new1", "u:new3")).toEqual([]);
    expect(reasonOf("u:new2", "u:new3")).toEqual([]);
  });
  it("leaves different names apart", () => {
    expect(reasonOf("u:sarah1", "u:zeke2")).toEqual([]);
  });
});

describe("orgsLookAlike", () => {
  it("the same name, however it's typed", () => {
    expect(orgsLookAlike("Abiding Practice", "  abiding practice.")).toBe("same_name");
  });
  it("one name the start of the other", () => {
    expect(orgsLookAlike("The Grove Center for", "The Grove Center for the Arts & Media")).toBe("starts_the_same");
    expect(orgsLookAlike("The Grove Center fo", "The Grove Center for the Arts")).toBe("starts_the_same");
  });
  it("every telling word of one in the other", () => {
    expect(orgsLookAlike("BetLynArt and Shreves Publishing SESAC", "BetLynArt Publishing (SESAC)")).toBe("most_words");
    expect(orgsLookAlike("BetLynArt and Shreve's Publishing SESAC", "BetLynArt & Shreves Publishing SESAC")).toBe(
      "most_words",
    );
  });
  it("leaves different organizations apart", () => {
    expect(orgsLookAlike("The Grove", "The Arts Collective")).toBeNull();
    expect(orgsLookAlike("Grove Church", "Grove Studio")).toBeNull();
    // One meaningful word isn't enough to start another name.
    expect(orgsLookAlike("The Art", "Art House San Diego")).toBeNull();
    expect(orgsLookAlike("San Diego Art Center", "Chicago Music Hall")).toBeNull();
    // Three of four words isn't the same organization: two churches.
    expect(orgsLookAlike("First Baptist Church of Carlsbad", "First Baptist Church of Vista")).toBeNull();
  });
});

describe("groupEdges", () => {
  it("makes groups, not just pairs", () => {
    const orgs = [
      { id: "o:1", name: "The Grove Center for" },
      { id: "o:2", name: "The Grove Center for the Arts & Media" },
      { id: "o:3", name: "the grove center for the arts and media" },
      { id: "o:4", name: "Abiding Practice" },
    ];
    expect(groupEdges(orgEdges(orgs))).toEqual([
      { ids: ["o:1", "o:2", "o:3"], reasons: ["same_name", "starts_the_same"] },
    ]);
  });

  it("leaves out a pair someone dismissed, so it doesn't come back", () => {
    const edges = personEdges([
      { id: "u:a", name: "Sarah Shreves" },
      { id: "u:b", name: "Sarah Shreves" },
    ]);
    expect(groupEdges(edges, new Set([pairKey("u:b", "u:a")]))).toEqual([]);
  });

  it("a new look-alike joining a dismissed pair brings the group back", () => {
    const edges = personEdges([
      { id: "u:a", name: "Sarah Shreves" },
      { id: "u:b", name: "Sarah Shreves" },
      { id: "u:c", name: "SARAH SHREVES" },
    ]);
    const [group] = groupEdges(edges, new Set([pairKey("u:a", "u:b")]));
    expect(group.ids).toEqual(["u:a", "u:b", "u:c"]);
  });

  it("dismissing every pair of the group puts it away", () => {
    const edges = personEdges([
      { id: "u:a", name: "Sarah Shreves" },
      { id: "u:b", name: "Sarah Shreves" },
      { id: "u:c", name: "Sarah Shreves" },
    ]);
    expect(groupEdges(edges, new Set(pairKeysOf(["u:a", "u:b", "u:c"])))).toEqual([]);
  });
});

describe("copiesToMerge", () => {
  it("is the ticked copies, the kept one aside", () => {
    const ids = ["o:grove", "o:church", "o:center"];
    expect(copiesToMerge(ids, "o:center", new Set(ids))).toEqual(["o:grove", "o:church"]);
    // "The Grove Church" isn't the same one: unticked, it stays out.
    expect(copiesToMerge(ids, "o:center", new Set(["o:grove", "o:center"]))).toEqual(["o:grove"]);
    expect(copiesToMerge(ids, "o:center", new Set(["o:center"]))).toEqual([]);
  });
});

describe("words", () => {
  it("pairKey is the same either way round", () => {
    expect(pairKey("b", "a")).toBe(pairKey("a", "b"));
  });
  it("pairKeysOf lists each pair once", () => {
    expect(pairKeysOf(["a", "b", "c", "a"])).toEqual(["a+b", "a+c", "b+c"]);
  });
  it("listPhrase", () => {
    expect(listPhrase([])).toBe("");
    expect(listPhrase(["bio"])).toBe("bio");
    expect(listPhrase(["bio", "photo"])).toBe("bio and photo");
    expect(listPhrase(["bio", "photo", "interests"])).toBe("bio, photo and interests");
  });
});
