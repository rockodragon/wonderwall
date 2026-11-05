import { describe, expect, it } from "vitest";
import { filterVotingRows, sortVotingRows, type VotingRow } from "./projectVoting";

const rows: (VotingRow & { id: string })[] = [
  { id: "a", title: "bridge", createdAt: 100, cheers: 2, status: "new", myVote: "yes" },
  { id: "b", title: "Anthem", createdAt: 300, cheers: 2, status: "shortlisted", myVote: null },
  { id: "c", title: "choir", createdAt: 200, cheers: 9, status: "new", myVote: null },
];
const ids = (list: { id: string }[]) => list.map((r) => r.id);

describe("sortVotingRows", () => {
  it("keeps the server's jury order as it came", () => {
    expect(ids(sortVotingRows(rows, "jury"))).toEqual(["a", "b", "c"]);
  });

  it("most cheered first, newest breaking the tie", () => {
    expect(ids(sortVotingRows(rows, "cheers"))).toEqual(["c", "b", "a"]);
  });

  it("newest first", () => {
    expect(ids(sortVotingRows(rows, "newest"))).toEqual(["b", "c", "a"]);
  });

  it("A–Z regardless of case", () => {
    expect(ids(sortVotingRows(rows, "title"))).toEqual(["b", "a", "c"]);
  });

  it("never reorders the caller's array", () => {
    sortVotingRows(rows, "title");
    expect(ids(rows)).toEqual(["a", "b", "c"]);
  });
});

describe("filterVotingRows", () => {
  it("by decision, by whether I've voted, or both", () => {
    expect(ids(filterVotingRows(rows, "all", "all"))).toEqual(["a", "b", "c"]);
    expect(ids(filterVotingRows(rows, "new", "all"))).toEqual(["a", "c"]);
    expect(ids(filterVotingRows(rows, "all", "unvoted"))).toEqual(["b", "c"]);
    expect(ids(filterVotingRows(rows, "new", "unvoted"))).toEqual(["c"]);
  });
});
