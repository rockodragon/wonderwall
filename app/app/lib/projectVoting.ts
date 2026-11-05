// Sort and filter rules for /admin/voting (routes/admin.voting.tsx), pure so
// projectVoting.test.ts can pin them. The server (convex/showcase.ts
// adminList) hands over every project on the ballot already in jury order
// (compareForJury: the jury's favourites first, then newest), so "jury"
// keeps that order rather than re-deriving the score here. The rest is
// re-sorted and filtered on the client: a few hundred rows is nothing, and
// every click would otherwise be a round trip.

export type VotingSort = "jury" | "cheers" | "newest" | "title";

export const SORTS: { value: VotingSort; label: string }[] = [
  { value: "jury", label: "Jury score" },
  { value: "cheers", label: "Most cheered" },
  { value: "newest", label: "Newest" },
  { value: "title", label: "A–Z" },
];

/** "unvoted": only the projects the viewer hasn't voted on yet. */
export type VoteFilter = "all" | "unvoted";

export type VotingRow = {
  title: string;
  createdAt: number;
  cheers: number;
  status: string;
  myVote: string | null;
};

export function sortVotingRows<T extends VotingRow>(rows: readonly T[], sort: VotingSort): T[] {
  const out = [...rows];
  if (sort === "cheers") out.sort((a, b) => b.cheers - a.cheers || b.createdAt - a.createdAt);
  if (sort === "newest") out.sort((a, b) => b.createdAt - a.createdAt);
  if (sort === "title") out.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  return out;
}

export function filterVotingRows<T extends VotingRow>(
  rows: readonly T[],
  status: string,
  vote: VoteFilter,
): T[] {
  return rows.filter(
    (row) => (status === "all" || row.status === status) && (vote === "all" || row.myVote === null),
  );
}
