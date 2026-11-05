# Smart search (People and Projects)

Decided 2026-11-04 (Rick: "make projects and profiles semantic and smart. text-based is defunct").

## What a search does

A search is two halves merged into one list (`app/convex/searchRules.ts`):

1. **Names, by their words.** Every word typed must start a word in a person's name or organization, or a project's title or maker. "hal mont" finds Haley Montgomery. Searching by meaning can't reliably find names, so names stay a word match.
2. **Meaning, for everything else.** Each profile and project has an embedding (OpenAI `text-embedding-3-small`), rewritten whenever its text changes. A search is embedded the same way, and the closest matches come back.
   - A profile's embedding is made of its name, role, bio, disciplines, place, organization and active wondering.
   - A project's embedding is made of its title, maker, blurb, write-up, topics, open roles, public place (never a street address) and its pieces' titles and notes.

Name hits come first, in the list's usual order. Meaning hits follow, closest first.

## Where it runs

- **People.** It runs on `/people` and on Today › People (Everyone and Following). `useDirectory` asks `smartSearch.rank` first, then passes the ranked ids to `profiles.directory`. The directory still decides who may appear.
- **Projects.** It runs on Today › Projects. The ranked ids order and filter the list `listProjects` already returned.
- **Not covered:** `/projects` has no search box. Events and organizations keep their own name search.

## Rules

- **Signed in only.** Every search is one OpenAI call. A visitor's search, a search under 3 letters, or a failed call falls back to names only.
- **`rank` returns ids only.** For a project, each id is also checked to be listed and visible to the caller.
- **The cut (`keepRelevant`).** A hit stays when its score is at least 0.28 for a project or 0.23 for a person, and within 0.10 of the best hit.
  - Calibrated on the live site's 215 projects and a page of people, over 29 searches judged by hand. Nonsense searches return nothing.
  - Profiles are short, so they score lower than projects.
  - Rerun the calibration once every profile is indexed. The script is described in the PR.
- **Model mismatches are skipped.** A stored vector from another model (ada-002 before this) is ignored until it is re-embedded.

## Operator steps

After the backend deploys, run once:

```
npx convex run --prod embeddings:backfillSearch
```

It queues an embedding for every profile and every shown project, 150 ms apart, and skips anything already current. Until it runs, searches are names only. Run it again whenever `SEARCH_MODEL` changes.
