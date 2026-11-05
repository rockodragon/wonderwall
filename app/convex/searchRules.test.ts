// Smart search's rules (convex/searchRules.ts), pure: how words are read, who
// matches a name, how name hits and meaning hits merge, which meaning hits
// are close enough, and what a person's and a project's embedding is made of.

import { describe, expect, it } from "vitest";
import {
  MAX_QUERY,
  MIN_MEANING_QUERY,
  MIN_SCORE,
  SCORE_WINDOW,
  SEARCH_MODEL,
  embeddingIsCurrent,
  matchesNameWords,
  meaningQuery,
  profileSearchText,
  relevantHits,
  type SearchHit,
  projectSearchText,
  rankByQuery,
  searchWords,
} from "./searchRules";

describe("searchWords", () => {
  it("lowercases and drops accents", () => {
    expect(searchWords("José Müller-Ñandú")).toEqual(["jose", "muller", "nandu"]);
  });

  it("splits on punctuation and spaces, keeps digits", () => {
    expect(searchWords("Café-Noir! (Vol. 2)")).toEqual(["cafe", "noir", "vol", "2"]);
    expect(searchWords("  ,, ")).toEqual([]);
  });

  it("reads missing text as no words", () => {
    expect(searchWords(undefined)).toEqual([]);
    expect(searchWords(null)).toEqual([]);
    expect(searchWords("")).toEqual([]);
  });
});

describe("matchesNameWords", () => {
  const fields = ["Haley Montgomery", "DALL Collective", undefined, null];

  it("matches when each word typed starts a word", () => {
    expect(matchesNameWords(fields, "hal mont")).toBe(true);
    expect(matchesNameWords(fields, "dall")).toBe(true);
    expect(matchesNameWords(fields, "Montgomery Haley")).toBe(true);
  });

  it("needs every word", () => {
    expect(matchesNameWords(fields, "hal smith")).toBe(false);
  });

  it("matches the start of a word, not the middle", () => {
    expect(matchesNameWords(fields, "ley")).toBe(false);
    expect(matchesNameWords(fields, "gomery")).toBe(false);
  });

  it("is accent- and case-blind", () => {
    expect(matchesNameWords(["Zoë Álvarez"], "zoe alv")).toBe(true);
    expect(matchesNameWords(["Zoe Alvarez"], "ZOË")).toBe(true);
  });

  it("an empty or all-punctuation query matches nothing", () => {
    expect(matchesNameWords(fields, "")).toBe(false);
    expect(matchesNameWords(fields, "  !  ")).toBe(false);
    expect(matchesNameWords([], "hal")).toBe(false);
  });
});

describe("rankByQuery", () => {
  type Item = { id: string; name: string };
  const items: Item[] = [
    { id: "a", name: "Zed Quartet" },
    { id: "b", name: "Quiet Hands" },
    { id: "c", name: "Songs for rain" },
    { id: "d", name: "Quilting circle" },
    { id: "e", name: "Pottery" },
  ];
  // Ids in the order given, scores descending and all well inside the window.
  const hits = (...ids: string[]): SearchHit[] => ids.map((id, i) => ({ id, score: 0.5 - i * 0.001 }));
  const opts = (query: string, ids?: string[] | null) => ({
    query,
    id: (i: Item) => i.id,
    names: (i: Item) => [i.name],
    ranked: ids ? hits(...ids) : ids,
  });
  const ids = (list: Item[]) => list.map((i) => i.id);

  it("name hits first, in the list's own order, then the ranked ones in ranked order", () => {
    expect(ids(rankByQuery(items, opts("qu", ["e", "c"])))).toEqual(["a", "b", "d", "e", "c"]);
  });

  it("never lists an item twice: a name hit that is also ranked stays among the names", () => {
    expect(ids(rankByQuery(items, opts("qui", ["d", "c", "b", "c"])))).toEqual(["b", "d", "c"]);
  });

  it("ids not in the list are never added", () => {
    expect(ids(rankByQuery(items, opts("rain", ["zzz", "c", "ghost"])))).toEqual(["c"]);
    expect(rankByQuery(items, opts("zzzz", ["nope"]))).toEqual([]);
  });

  it("no ranked (or null) is names only", () => {
    expect(ids(rankByQuery(items, opts("qu")))).toEqual(["a", "b", "d"]);
    expect(ids(rankByQuery(items, opts("qu", null)))).toEqual(["a", "b", "d"]);
    expect(ids(rankByQuery(items, opts("qu", [])))).toEqual(["a", "b", "d"]);
  });

  it("sorts the meaning hits by score, whatever order they came in", () => {
    const ranked: SearchHit[] = [
      { id: "e", score: 0.3 },
      { id: "c", score: 0.35 },
    ];
    expect(ids(rankByQuery(items, { ...opts("rain"), ranked }))).toEqual(["c", "e"]);
  });

  it("cuts to the window of the best hit that is in the list, not the best overall", () => {
    const ranked: SearchHit[] = [
      { id: "outside", score: 0.9 },
      { id: "c", score: 0.5 },
      { id: "e", score: 0.5 - SCORE_WINDOW + 0.01 },
      { id: "d", score: 0.5 - SCORE_WINDOW - 0.01 },
    ];
    expect(ids(rankByQuery(items, { ...opts("zzzz"), ranked }))).toEqual(["c", "e"]);
  });

  it("a name hit's own score doesn't set the window", () => {
    const ranked: SearchHit[] = [
      { id: "b", score: 0.9 },
      { id: "c", score: 0.5 },
    ];
    expect(ids(rankByQuery(items, { ...opts("quiet"), ranked }))).toEqual(["b", "c"]);
  });

  it("does not change the list it was given", () => {
    const copy = [...items];
    rankByQuery(items, opts("qu", ["e"]));
    expect(items).toEqual(copy);
  });
});

describe("relevantHits", () => {
  it("drops hits under the kind's floor", () => {
    expect(relevantHits("people", [{ id: "a", score: MIN_SCORE.people - 0.01 }])).toEqual([]);
    expect(relevantHits("people", [{ id: "a", score: MIN_SCORE.people }])).toEqual([{ id: "a", score: MIN_SCORE.people }]);
  });

  it("projects have a higher floor than people", () => {
    expect(MIN_SCORE.projects).toBeGreaterThan(MIN_SCORE.people);
    const hit = [{ id: "a", score: (MIN_SCORE.people + MIN_SCORE.projects) / 2 }];
    expect(relevantHits("people", hit)).toEqual(hit);
    expect(relevantHits("projects", hit)).toEqual([]);
  });

  it("applies no window: a far hit above the floor stays", () => {
    const out = relevantHits("projects", [
      { id: "best", score: 0.5 },
      { id: "far", score: 0.5 - SCORE_WINDOW - 0.05 },
    ]);
    expect(out.map((h) => h.id)).toEqual(["best", "far"]);
  });

  it("sorts closest first, whatever order they came in", () => {
    expect(
      relevantHits("people", [
        { id: "b", score: 0.3 },
        { id: "a", score: 0.35 },
        { id: "c", score: 0.25 },
      ]).map((h) => h.id),
    ).toEqual(["a", "b", "c"]);
  });

  it("lists an id once, at its best score", () => {
    expect(
      relevantHits("people", [
        { id: "a", score: 0.3 },
        { id: "b", score: 0.33 },
        { id: "a", score: 0.35 },
      ]),
    ).toEqual([
      { id: "a", score: 0.35 },
      { id: "b", score: 0.33 },
    ]);
  });

  it("no hits, no result; and does not change its input", () => {
    expect(relevantHits("projects", [])).toEqual([]);
    const hits = [{ id: "a", score: 0.2 }, { id: "b", score: 0.4 }];
    relevantHits("projects", hits);
    expect(hits.map((h) => h.id)).toEqual(["a", "b"]);
  });
});

describe("meaningQuery", () => {
  it("trims, and is null under the minimum", () => {
    expect(meaningQuery("  hi ")).toBeNull();
    expect(meaningQuery("a".repeat(MIN_MEANING_QUERY - 1))).toBeNull();
    expect(meaningQuery("  jazz  ")).toBe("jazz");
    expect(meaningQuery(undefined)).toBeNull();
    expect(meaningQuery(null)).toBeNull();
  });

  it("is cut to the longest search", () => {
    expect(meaningQuery("x".repeat(MAX_QUERY + 50))).toHaveLength(MAX_QUERY);
  });
});

describe("profileSearchText", () => {
  it("is made of what the public profile shows and what they're wondering", () => {
    const text = profileSearchText({
      name: "Haley Montgomery",
      primaryRole: "creative",
      bio: "Paints harbors",
      interests: ["Painting", "Film"],
      location: "San Diego, CA",
      orgName: "DALL Collective",
      wondering: "Who films harbors?",
    });
    expect(text.split("\n")).toEqual([
      "Haley Montgomery",
      "creative",
      "Paints harbors",
      "Disciplines: Painting, Film",
      "Based in San Diego, CA",
      "With DALL Collective",
      "Wondering: Who films harbors?",
    ]);
  });

  it("leaves out what is missing or blank", () => {
    expect(profileSearchText({ name: "Ana", bio: "  ", interests: [], location: null })).toBe("Ana");
  });
});

describe("projectSearchText", () => {
  const base = {
    title: "Harbor Songs",
    blurb: "An album",
    body: "Recorded on the water.",
    topics: ["Music"],
    roles: ["Drummer", "Mixer"],
    place: "San Diego, CA",
    maker: "Ana",
    pieces: [{ title: "Track 1", description: "the opener" }, { title: "Cover" }],
  };

  it("holds title, maker, blurb, body, topics, open roles, place and pieces", () => {
    expect(projectSearchText(base).split("\n")).toEqual([
      "Harbor Songs",
      "By Ana",
      "An album",
      "Recorded on the water.",
      "Topics: Music",
      "Looking for: Drummer, Mixer",
      "In San Diego, CA",
      "Track 1 — the opener",
      "Cover",
    ]);
  });

  it("takes the place as it is given: a street address is never part of it", () => {
    const text = projectSearchText({ title: "Mural", place: "San Diego, CA" });
    expect(text).toContain("In San Diego, CA");
    expect(text).not.toMatch(/\d+ [A-Z][a-z]+ (St|Ave|Street)/);
    expect(projectSearchText({ title: "Mural" })).toBe("Mural");
  });

  it("is cut to 8000 characters", () => {
    expect(projectSearchText({ title: "T", body: "x".repeat(20000) }).length).toBe(8000);
  });
});

describe("embeddingIsCurrent", () => {
  it("is true only for the same text from the current model", () => {
    expect(embeddingIsCurrent({ content: "a", model: SEARCH_MODEL }, "a")).toBe(true);
    expect(embeddingIsCurrent({ content: "a", model: SEARCH_MODEL }, "b")).toBe(false);
    expect(embeddingIsCurrent({ content: "a", model: "text-embedding-ada-002" }, "a")).toBe(false);
    expect(embeddingIsCurrent({ content: "a" }, "a")).toBe(false);
    expect(embeddingIsCurrent(null, "a")).toBe(false);
  });
});
