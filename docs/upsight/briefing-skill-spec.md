# UpSight briefing skill: product and engineering spec

Draft 2026-10-01 for the UpSight MCP server and Uppy.

## 1. Why

Rick Moy had a 12-card Bay Area briefing built by hand from one newsletter, with an orbit graph, org and people cards, event verdicts, and next best actions. UpSight should produce that on request, in chat or by voice, from data it holds. Today a subagent that mirrored it into project `8690710d-3f73-4927-89e9-5a153a943949` left ten orgs with unreadable notes, one person outside the project, and no links, images, or distances, so this spec fixes those tools and adds `generate_briefing` plus six Uppy skills, with research and build done by subagents.

**Reference artifact.** One self-contained HTML file (518 KB, 37 inline JPEG headshots, 12 slides, 3 checkboxes) at https://claude.ai/artifact/NmxSZhrMKuF2hPNEimQmee, with screenshots `graph-1440x900.png` and `people-1440x900.png`. Data: `docs/data/civic-graph-nodes.csv` (131 orgs, 85 people), `civic-graph-edges.csv` (111 edges, 28 relationship strings, hence the fixed vocabulary), and `docs/funding/bay-area-networking-plan.md`.

## 2. Bugs and gaps in the current MCP tools

| Tool | Missing or wrong in schema | Seen today | Fix |
|---|---|---|---|
| `upsert_person` | No `projectId` or `project_ids`; `manage_people` and `fetch_people_details` both take `projectId`. | Keele was created account-level; a project `peopleSearch` for "Keele" returns "Failed scopes: people". Ten others skipped. | Add `project_id` (default: context) and `project_ids[]`; write the project-person row in one transaction; return `person_id`, `organization_id`, `url`. |
| `upsert_person` | `company` is free text, no `organizationId`; "ensure org and link" breaks when the org exists. | Linking Keele failed: org existed. | Accept `organization_id`; else resolve `company` by domain, then name. Existing org: link it, never error. |
| `upsert_person` | No photo, `source_url`, or `confidence` input, though `fetch_project_status` already returns `image_url`. | No headshot could be saved. | Add `photo` (`{url}` or `{base64,mime}`), `source_url`, `confidence`; server fetches, resizes, stores, returns `photo_url`, `photo_blob`. |
| `manage_organizations` | `data.notes` is accepted; `get` and `list` do not return it. | why/ask/route/source for ten orgs unverifiable. | Return every written field; add `extras` JSON; respond with `saved_fields[]` read back after write. |
| `manage_organizations` | No logo, address, lat/lng, geo link, `type`, cost, programs, how-to-get-in; `headquarters_location` is one string. | Org content only fit in notes. | Add the Section 3 fields; geocode on write. |
| `manage_organizations` | `create` dedups by embedding; only `forceCreate` bypasses it; no upsert, no person link. | Re-creating collides with dedup. | Add `action:"upsert"` matching domain host, legal name, then embedding at 0.85; return `{organization_id, created, matched_on}`; add `link_people[]`. |
| `manage_people`, `semantic_search_people`, `semantic_search_organizations` | `manage_people` is get/list/delete, `nameSearch` skips orgs, and the two descriptions disagree on whether semantic search covers org names. Org search lacks `type`, `near`, `eventId`. | Cannot list "people at KingdomHaus"; dedup is embedding-only. | Add `organizationId`, `linkedTo`, `maxDegree` to people; `type`, `near`, `eventId` and an exact-domain pre-step to orgs; fix descriptions. |
| `fetch_people_details`, `fetch_project_status` | No org filter or `offset` (50 per call); `company` is a string, no org id; `scopes` lacks organizations, tasks, relationships, events, briefs. | No person-to-org jump. | Return `organization_id`, `photo_url`, `degree_from_user`, `strength_to_user`; add scopes; no match returns `[]`. |
| `generate_pre_meeting_brief` | People-only input; output is a widget the caller must not narrate. | Unusable for a network brief. | Add `format:"json"` returning `questions[]`, `how_to_engage`, reused for ask/route. |
| `deliver_visual_frameworks` | list/get/search of fixed cards; no `data` input. | Cannot render a supplied graph. | Leave it; `generate_briefing` renders, reusing its card chrome. |
| `create_task`, `fetch_tasks` | `links[].entityType` lacks `event`, `brief`; one `dueDate`; no `kind` or `externalId`; `relatedPeople` creates unmatched people unprompted; no fetch filter by event, brief, kind. | A re-run would duplicate actions. | Add `event`, `brief`, `relationship` types; `kind:"nba"`, `startAt`, `endAt`, unique `externalId`; fetch filters `eventId`, `briefId`, `kind`. |
| `manage_follow_up_drafts` | `interviewId` required for generate and list; no recipient. | The Dustin and Rié email has no interview. | Allow `personIds[]` or `taskId` anchors and `to[]`. |
| `generate_app_link` | `entityType` lacks `task`, `event`, `brief`, `project`; needs an id returned this turn. | Actions, briefs unlinkable. | Add types; the briefing builds URLs server-side (`https://getupsight.com/a/{account}/{project}/people/{id}`). |

## 3. Data model additions

Examples use CSV ids and illustrative coordinates; real ids are UUIDs. Every entity gets a stable `slug`, unique per project.

**Person.** New fields as shown; `photo_blob` is an attachment id. `confidence` is high (org's own page), medium (third-party or snippet), or low (inferred). Computed fields are cached and rebuilt on any edge write.

```json
{"id":"p_keele","slug":"dustin-keele","name":"Dustin Keele","title":"President","org_ids":["connectsv"],
 "photo_url":"https://connect.sv/img/keele.jpg","photo_blob":"att_9f2","source_url":"https://connect.sv/",
 "confidence":"high","why":"Founder, SolRates; co-leads New Canaan Society SV","ask":"20 min; two angel intros",
 "route":"Newsletter reply, cc Collett",
 "computed":{"degree_from_user":2,"path_from_user":["user","connectsv","p_keele"],"strength_to_user":1}}
```

**Organization.** `type` is convener, fund, club, accelerator, venue, church, or company; `geo_precision` is street or city.

```json
{"id":"connectsv","slug":"connect-silicon-valley","name":"Connect Silicon Valley","type":"convener",
 "website":"https://connect.sv","logo_url":"https://connect.sv/logo.svg","logo_blob":"att_a11",
 "why_it_matters":"Convenes the faith-and-tech angels who write pre-seed checks","address":"Mountain View, CA","lat":37.3861,"lng":-122.0839,
 "geo_precision":"city","geo_link":"https://www.google.com/maps/search/?api=1&query=37.3861,-122.0839",
 "cost":{"model":"free","detail":"No fee; donations $50-$500"},
 "programs":["Open Table (Tue)","Founder Friday"],"how_to_get_in":"Reply to the October newsletter; ask Collett for 20 minutes",
 "source_url":"https://connect.sv/","confidence":"high"}
```

**Relationship.** `type` is one of `leads, founded, co_founded, member_of, board_of, mentors, partners, hosts, spoke_at, funds, knows, newsletter, met`; the importer maps the 28 CSV strings onto these, keeping originals in `detail`. `strength` 1 (public tie), 2 (warm: intro, reply), 3 (strong: spoken, will take a call). Distance ignores direction.

```json
{"source":"p_jmunro","target":"kingdomhaus","type":"co_founded","strength":3,"confidence":"high",
 "evidence_url":"https://www.kingdom.haus/our-story","date":null}
{"source":"user","target":"p_jmunro","type":"met","strength":3,"confidence":"high","evidence_url":null,"date":"2026-10-05"}
```

**Event.**

```json
{"id":"faw_kickoff","name":"Faith at Work kickoff, SF Tech Week","start":"2026-10-05T09:00-07:00","end":"2026-10-05T10:30-07:00",
 "venue":"Spaces Mission & 3rd","address":"95 Third St, San Francisco, CA","lat":37.7876,"lng":-122.4010,
 "host_org_id":"cit","partner_org_ids":["connectsv","kingdomhaus","fwt"],
 "verdict":{"call":"go","reason":"Every partner org in one room"}}
```

**NextBestAction** is a task with `kind:"nba"`.

```json
{"kind":"nba","title":"Reply to Dustin and Rié","why":"Ask for 20 minutes on Oct 5","due":"2026-10-01","priority":1,"status":"todo",
 "entities":[{"type":"person","id":"p_keele"},{"type":"person","id":"p_collett"},{"type":"event","id":"faw_kickoff"}],
 "source_brief_id":"brf_01","external_id":"brf_01:reply-keele-collett","draft_id":"ann_77"}
```

**Brief.**

```json
{"id":"brf_01","project_id":"8690710d-3f73-4927-89e9-5a153a943949","subject":{"type":"event","id":"faw_kickoff"},
 "cards":["cover","orbit","org","org","org","reality","people","people","people","events","nba","sources"],
 "generated_at":"2026-10-01T18:00:00Z","snapshot":{"data_version":"sha256:ab12","orgs":10,"people":11,"edges":37},
 "artifact_url":"https://getupsight.com/a/{account}/{project}/briefs/brf_01","html_attachment":"att_b01"}
```

**Orbit math.** Root is the project owner's person row (here Rick Moy, `b2627ce4-a229-467a-9ce9-bfca23be8ccf`; add `project.owner_person_id`). BFS over all node types, undirected; one edge is one link, so orgs count as stops. Among equal-length paths pick the highest weakest-link strength, then highest sum, then lowest id; `strength_to_user` is that path's weakest link.

## 4. Uppy skills

Each skill is one Uppy primitive with typed arguments (`uppy.research(seed)`, `uppy.save(bundle)`, `uppy.orbit(org, max_degree)`, `uppy.brief(subject, options)`, `uppy.nba(range)`, `uppy.followup(person, strength, due)`), so chat and voice share one path. Voice replies run at most 40 words, send links to chat, speak absolute dates, and confirm each write in one sentence.

**`research_network`**
- Say: "research the Connect Silicon Valley network"; "Uppy, dig into this newsletter".
- Inputs: project; seed (email or newsletter text, Gmail thread, URL, event, or person).
- Steps: parse the seed into candidate orgs, people, events; dedupe against the project; spawn one subagent per org (8 parallel) that reads only that org's own domain (about, team, programs, events, pricing, contact), pulls logo and headshots, and returns fields with `source_url`, `retrieved_at`, `confidence`, caveats; merge.
- Tools: `semantic_search_organizations` (0.85), `semantic_search_people`, subagent web fetch.
- Output: unsaved bundle (orgs, people, edges, events, caveats).
- Guardrails: never fetch or scrape LinkedIn; set `linkedinUrl` only if the org's own page links it; obey robots.txt, 1 request/second/host, 40 pages/org; snippet-only facts cap at medium with a caveat; log 404s; no emails or phones unless published.

**`save_network`**
- Say: "save these to the project".
- Inputs: project; bundle.
- Steps: upsert orgs, then people (`project_id`, `organization_id`, photo), edges, events; read each record back and diff.
- Tools: `manage_organizations`, `upsert_person`, `manage_relationships`, `manage_events`, `fetch_people_details`.
- Output: `{created, matched, failed[]}` with an app link per record.
- Guardrails: dedupe by website, email, then name; an unconfirmed read is a failure; no `forceCreate` without user confirmation; no deletes.

**`compute_orbit`**
- Say: "who's two links from me at KingdomHaus"; "how am I connected to Dustin Keele"; "who are my strongest connections".
- Inputs: project; optional org, person, `max_degree`.
- Steps: BFS per Section 3; cache on persons.
- Tools: `manage_relationships`, `fetch_people_details`.
- Output: `[{person, degree, strength, path}]`; voice speaks the top three.
- Guardrails: show `unrated` for unrated edges; never infer a `met` edge.

**`generate_brief`**
- Say: "brief me on Connect Silicon Valley".
- Inputs: project; subject; options.
- Steps: confirm subject; `compute_orbit`; `generate_briefing`.
- Tools: `generate_briefing`, `generate_app_link`.
- Output: link, 40-word headline, top three NBAs.
- Guardrails: never narrate the whole brief by voice; warn on missing photos and low confidence.

**`next_best_actions`**
- Say: "what are my next best actions for Oct 5".
- Inputs: project; date range or subject.
- Steps: derive from events (RSVP deadlines, verdicts), asks, deadlines, and calendar conflicts (event windows against Google Calendar, e.g. "meet patrick & sheri" 10:00 to 12:00); create `kind:"nba"` tasks with due date, entity links, `externalId`; draft emails.
- Tools: `create_task`, `fetch_tasks`, `manage_follow_up_drafts`, Google Calendar read.
- Output: ordered NBAs with links.
- Guardrails: dates and activities are called Next best actions, never "schedule" or "todos"; dedupe by `externalId`.

**`brief_followup`**
- Say: "I met Jess Munro, strong connection, follow up Friday".
- Inputs: person; strength; date; optional notes.
- Steps: resolve the person (one question if two match); write a `met` edge; create a follow-up NBA for the resolved Friday; re-run `compute_orbit`; propose NBAs for newly reachable people.
- Tools: `manage_relationships`, `create_task`, `compute_orbit`.
- Output: confirmation naming the date and newly reachable contacts.
- Guardrails: strong=3, warm=2, brief=1; offer undo.

## 5. The `generate_briefing` tool contract

```json
{"project_id":"uuid, required",
 "subject":{"type":"event|org|person|query","id":"uuid","text":"Bay Area, Oct 5"},
 "seed_ids":["default: subject's neighbors"],
 "include_cards":["cover","orbit","org","reality","people","events","nba","sources"],
 "theme":"dark-lime|light|upsight","date_range":{"from":"2026-10-01","to":"2026-10-11"},
 "max_people":12,"regenerate":false}
```

```json
{"status":"ready|queued|failed","brief_id":"brf_01","artifact_url":"https://…","html":"<!doctype html>…",
 "manifest":{"cards":[],"entities":[{"id":"","type":"","slug":"","app_url":"","degree":2}],"edges":[],"images":[],"positions":{}},
 "nba_ids":["task uuid"],"warnings":[{"code":"missing_photo","entity_id":"p_bmunro"}],
 "spoken":{"headline":"","top_nbas":["","",""]}}
```

- Limits: HTML at most 2 MB, self-contained; images 256 px JPEG at most 40 KB each, at most 40, then initials; manifest at most 200 KB; at most 12 orgs and 30 people (`max_people` default 12); at most 40 edges drawn, the rest in the text list. `html` is omitted above 256 KB; use `artifact_url`. Runs inline up to 20 s, else `queued` and Uppy posts the link.
- Idempotency: key is sha256 of project, subject, sorted seeds, cards, theme, date range, `max_people`, `data_version`; same key returns the same `brief_id` and bytes. `regenerate:true` makes `brf_01@2`. NBAs upsert by `external_id`.
- Storage: HTML and manifest are attachments on a `briefs` row; `artifact_url` is the in-app page and the project lists briefs; each NBA task has the brief as `source`; `generate_app_link` accepts `brief`. Checkboxes carry `data-task-id` and call `mark_task_complete` in UpSight; standalone they use localStorage.

## 6. Card contract

Order is fixed. Slots 3 to 5 are the top three orgs by hub score; 7 to 9 are people grouped by org; empty slots drop out.

| # | Card | Required fields |
|---|---|---|
| 1 | cover | verdict (go, skip, maybe, one line), subject, date, counts, top three targets |
| 2 | orbit | nodes, edges, highlight set, targets, text list |
| 3-5 | org | logo, what it is, why it matters, who runs it (people chips), cost, how to get in, geo link, source |
| 6 | reality | headline, `series[{label,value,unit,source_url}]`, so-what |
| 7-9 | people | photo or initials, name, title, org chip, why, ask, route, degree badge, strength, target flag, confidence, source |
| 10 | events | per event: times, venue, address, geo link, host and partner chips, verdict; day timeline with conflicts |
| 11 | nba | rows of checkbox, title, why, due, entity chips; email draft with copy button |
| 12 | sources | each `source_url` with entity chips, confidence, caveats (404s, snippet-only), `generated_at` |

**Linking rules.**
- Slug is DOM id, `data-entity-id`, `data-entity-type`; never regenerated.
- Every person or org mention is a chip (photo or initials) linking `#slug`. A person chip opens a popover (photo, title, org chip, degree, strength, ask, route, sources, "Open in UpSight", "Show in orbit"), so no context is needed.
- Every person card links its org card; every org card lists its people; every card has an "Orbit" back-link. Entities outside the brief link to `app_url`; a dangling link fails the build.
- Any entity with an address or lat/lng gets a map link; city precision is labeled.
- Missing data is omitted and warned, never invented. Actions are labeled "Next best actions".

**Orbit rules.**
- User at center; rings by degree 1, 2, 3, 4+; layout seeded by brief id, saved in `manifest.positions`.
- Hubs: top two orgs by partner and member count, drawn largest. Highlight set: entities tied to the subject, filled, with a legend label. Top targets: ringed, at most five.
- Degree badge: numeral at the avatar's lower right, plus a 1 to 3 dot meter for `strength_to_user`; never color alone.
- Strength: 3 is 3 px solid, 2 is 1.5 px solid, 1 is 1 px dashed, unrated is dotted.
- Hover, focus, or tap shows the shortest path, dims the rest to 25%, and captions it: "You, Connect SV (newsletter, 1), Dustin Keele (leads, 3)".
- Text fallback: an open `<details>` listing each edge (source, target, type, strength, evidence link) plus a by-degree list, from the same `edges[]`; default view under 600 px.

## 7. Acceptance tests

1. `upsert_person` with `project_id` and `company:"Connect Silicon Valley"` (org exists): the person appears in `fetch_people_details` for that project, links to the existing org, creates no org row; a repeat call returns the same ids.
2. `manage_organizations` update with notes and `extras` returns identical values from `get` and `list`.
3. A person photo and an org logo are stored; the brief renders both inline after the source URLs die.
4. An org with a street address gets lat/lng and `geo_link`; a failed geocode falls back to an address-search link with a warning.
5. Fixture: `met` Jess Munro (3) plus Connect SV `newsletter` (1) yields Jess 1, KingdomHaus 2, Keele 2, Collett 2, Bart Munro 3 (path user, Jess, KingdomHaus, Bart), matching an independent BFS of the edges table.
6. `generate_briefing` on project X: every person card links to its org card and back, with zero dangling hrefs; the text list matches `edges[]`.
7. Two identical `generate_briefing` calls return the same `brief_id`, HTML hash, and `nba_ids`; HTML is under 2 MB.
8. `fetch_tasks(kind:"nba", dueAfter:"2026-10-05", dueBefore:"2026-10-06")` returns the Oct 5 actions, each with an entity link; the 10:00 conflict yields a reschedule NBA due before Oct 5, linked to the event.
9. `research_network` on the Connect SV newsletter makes zero linkedin.com requests; every saved field has a `source_url` on the org's domain or confidence of medium or less plus a caveat; 404s reach the sources card.
10. Voice: "I met Jess Munro, strong connection, follow up Friday" writes a `met` edge (3, today), one task due next Friday linked to Jess, a refreshed orbit, and a reply of two sentences naming the date.

## 8. Rollout order

One build subagent per tool; a verifier subagent runs each phase's tests.

- Phase 0: `upsert_person` project and org-link fix; org notes round-trip. Gate: tests 1, 2.
- Phase 1: data model (attachments, org fields, `manage_relationships`, `manage_events`, task and app-link enums). Gate: tests 3, 4.
- Phase 2: `compute_orbit` and cached person fields. Gate: test 5.
- Phase 3: `generate_briefing`, brief storage, NBA upsert, `brief` link type. Gate: tests 6, 7, 8.
- Phase 4: Uppy skills and primitives, voice (`spoken`, queued jobs, confirmations), research subagents. Gate: tests 9, 10.
