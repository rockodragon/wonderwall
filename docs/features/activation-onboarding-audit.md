# Activation: make "share a project" the first thing

2026-10-09. Read-only audit. Screens are `app/app/…`, backend is `app/convex/…`. Tags: [Certain] read in code, [Likely] inferred, [Guessing] untested.

## 1. Proposed path

**Activated = a new member posted a project within 7 days of signing up.** Any kind of project counts; a finished piece from onboarding does not.

1. **Front door.** "Share your project" sends signed-out people to Create account, not Sign in. Today it lands on "Welcome back" (`login.tsx:188`).
2. **Account.** Same mechanics (Google: no fields; phone: name, email, number). Keep the consent line. Drop the Welcome modal (`signup.tsx:408`).
3. **One screen right after.** Replace role, details and first-work with one box: "What are you working on, or thinking about?" Button "Share it". Quiet link "Not yet". Under it: "I'm here to back creatives" (the patron/partner way out).
4. **Project page.** Keep "It's up. Invite people." (`InviteToThis.tsx`). Add one prompt: "Add a picture or link."
5. **Canvas.** Their project is the first card. Photo, interests, location, bio and role arrive later as single cards.

**Smallest project: a title.** The server already needs only that (`convex/garden/projects.ts:111`). Defaults already fit: Planning, remote, The Garden (`ProjectModal.tsx:74`). Optional one tap, "Thinking about it / Working on it" (Planning/Working; create takes no stage today, so a small change). Can wait: description, link, interests, location, community, goal, roles, ownership, money. Say on the screen that it's public: "Everyone can see it."

**Copy** (no money words, no promise of cheers or funding):
- Canvas before: "You're in. One thing left: share a project." Button "Share a project".
- Day-1 email: "What are you working on? A title is enough." Button "Share a project".
- Day-4 email, once more, then stop.

**Canvas before and after.**
- Before: that card, where Updates sit, until they share or close it. Updates archive when read (`updates.ts`), so they can't be this card.
- After: the project, marked as theirs. Then a row, "No cheers yet", showing others' new projects, so a new member's first act is to cheer someone.

**Nudges, days 0 to 7.**
- Day 0: a real host cheers every new project within a day. The cheer and daily email already exist.
- Day 1 and day 4: the two emails, only if nothing is shared and an email is on file. Schedule once at signup. No polling cron.
- Invite nudge (day 3) only for people who have shared.
- Day 7: "Find people / Ask for support" (exists). Money words from `CLAIMS` only.
- "Give" stays the second ask. A free member sees "Become a member" there (`give.tsx:248`), so it can't be the first win.

**Challenge:** [Likely] this fails if nobody answers a first project. Activation only counts if it predicts return. After ~30 signups, check that activated members come back at twice the rate of the rest.

**Measure** (needs two things the app lacks, see finding 4: events tied to the member, and a last-active date):
- Posted project within 1 hour, and within 7 days.
- A human response within 7 days.
- A return visit on days 2 to 7.

## 2. The current flow (as coded)

Both addresses run one flow. The Garden address changes the lockup, texts and where Google returns (`oauthHost.ts:19`). The signup community is The Garden on both (`defaultCommunity.ts:83`).

1. **Entry.** Garden `/`: "Share your project" → `/projects?new=project` (`GardenHome.tsx:174`); "Join The Garden" → `/signup` (`:232`). Exchange `/`: only "Create account" → `/signup` (`home.tsx:120`). Invite link `/signup/:code` adds an inviter card (`signup.tsx:474`). A ticket link adds "Your ticket is saved" (`:440`).
2. **Project call, signed out.** `projects.tsx:101-105` → `/login?redirect=…`. Phone box first, Google, email/password; "Create an account" is last (`login.tsx:388`). Phone or Google here quietly creates an account.
3. **Signup form.** Name, email, then "Text me a code" or password (`signup.tsx:567-620`); number (`:632`); code (`:682`). Google: no fields (`:765`). Consent is a passive line (`:797`); `agreedAt` is stamped at account creation (`convex/auth.ts:141`).
4. **Welcome modal** (phone/password only): "makers, dreamers, and doers", "Wonder together" (`signup.tsx:945-995`).
5. **Google return.** `oauth-callback.tsx:60-81` → `/onboarding`. If the Garden is invite-only, `/invite`.
6. **Gate.** `_app.tsx:201` sends anyone with no role, bio or interests to `/onboarding` (`onboardingGate.ts`).
7. **Onboarding step 1.** Pick Creative, Patron or Partner (`onboarding.tsx:420`).
8. **Step 2.** Creative: photo, interests (one required to Continue, `:184`), name, email if missing, location, bio, organization (`:450-537`). "Skip for now" saves the role and goes to the Canvas (`:231`). Skip also skips step 3.
9. **Step 3, creatives only.** "Share your first work" (`:692`). It creates a finished, hidden piece (`artifacts.ts:253`), not in Projects browse (`projects.ts:484`).
10. **Finish.** "Explore" → `/today` (`:877`). `_app.tsx:153` replays the saved `?new=project` and opens the form.
11. **Project form** (`ProjectModal.tsx`): three panels. Title is the only required field.

**Cost of the first project from "Share your project", phone path:** about 10 clicks and 5 typed entries (name, email, number, code, title) across 7 screens. Google with Skip: about 7 clicks plus Google's own screens, 1 typed entry. From "Create account" there is no project step at all, except that finished-work page.

**First days, what exists.**
- A sign-in code (`auth.ts:441`).
- No welcome email and no day 1 to 7 email.
- Once-only menu notes (`PaletteHint.tsx`).
- Admin Updates, drafts until published. "Welcome" points to People; "Add a photo" to Settings (`updates.ts:228-251`).
- The invite card on the third day opened, from the browser's own record (`visitDays.ts:8`).
- The daily cheers email (`crons.ts:61`).
- Phone Today's only project ask, as the second button on "Your profile is empty" (`today.tsx:614-640`). The desktop Canvas has none (`deskCards.ts:688`; the "+" card only in grid views, `deskLayout.ts:437`).

## 3. Audit findings, ranked

1. **[Certain] The ask is missing from the default path.** The only share step asks for finished work, and Skip drops it. Practice: one clear activation event, early (Lenny, Amplitude).
2. **[Certain] Too much before value.** Role, a required interest, a Name field that shows twice when the name is missing (`onboarding.tsx:459, 522`), org, bio, then a three-panel form. Each is profile data that can wait (progressive disclosure, NN/g). Baymard: 18% of shoppers quit when an account is demanded.
3. **[Certain] The front-door promise breaks at login.** "Welcome back", then a generic modal and a generic role question.
4. **[Certain] Activation can't be measured.** Only anonymous pageviews go out (`Analytics.tsx`, `root.tsx:86`), not tied to an account. The named events (`user_signed_up`, `onboarding_*`) use posthog-js, which is never started (`featureFlags.ts:2`; no init in `app/`), so they are dropped. No event for project creation. No last-active date. `/admin/activity` shows the newest 50 only.
5. **[Certain] The Canvas teaches nothing.** No project card on Home. NN/g: an empty state should offer a direct path.
6. **[Certain] No re-engagement before a cheer.** A phone account made from the login page, then skipped, has no email and gets none ever (`emailHelpers.ts:42`; `onboarding.tsx:194`). The daily email only reacts.
7. **[Likely] Cold start.** The loop (cheer, then email) needs a person to cheer. Evidence that specific asks and "your contribution is unique" raise contribution: Beenen et al.
8. **[Likely] Endowed progress is cheap here.** "You're in. One thing left" gives a head start (Nunes and Drèze: 34% vs 19%). Skip streaks and tables.
9. **[Certain] Truthful proof already exists.** The inviter card lists real recent invitees (`signup.tsx:504`); the Garden home flips real cards. Don't add counts; none exist (`PRODUCT.md`).
10. **[Likely] Spam.** Open signup plus instant public posting; no limit on create (`projects.ts:111`).

## 4. Conflicts with existing rules

- **Posting is free in code and in `CLAIMS`, but `/join` lists "Post a project and get backed" as a member perk** (`join.tsx:95`). `claims.md` "Never say" #11: the way in is free. The 9/15 proposal to make "publish" a member step is still open (`entitlements-live-status.md`).
- **Brief §4** wants the owner stated at creation. Not collected. `project-ia.md` #2 puts it on the project page; fine for this version.
- **Agreements** are taken at account creation, not in onboarding. Cutting onboarding doesn't touch them. Any new sign-up step must show the line. On thecreative.exchange it lists The Garden's agreements.
- **Money:** "Your project will get funded" is banned (#4). Say "creative", never "artist" (#8).
- **Welcome video** (`handoff/welcome-video-script.md`) as the new-member hero would delay the ask. Put the ask above it.
- **Canvas**, not desk, in copy.

## 5. Open questions for Rick

1. Does posting a project stay free for every account? (Recommend yes; fix `/join`.)
2. Cut role, details and first-work from onboarding, with the patron/partner link? (Recommend yes.)
3. Who gives the first cheer within a day? And may the first cheer email at once, against the one-a-day rule of 10/4?
4. OK to send the day-1 and day-4 emails (with unsubscribe)?
5. Is The Garden open or invite-only now? It's a database setting (`defaultCommunity.ts:100`). Invite-only turns the front-door call into a gate.
6. Public to everyone, or only to The Garden, for a first project?
7. For measuring: send the named events through the working pageview path (`Analytics.tsx`) and add a last-active date? Or start posthog-js properly (the key is in the `package.json` deploy script)?

## Sources

- Lenny Rachitsky, [What is a good activation rate](https://www.lennysnewsletter.com/p/what-is-a-good-activation-rate): activation should predict retention at 2x; fewer steps, earlier value.
- Amplitude, [7% retention rule](https://www.amplitude.com/blog/7-percent-retention-rule): week-one activation predicts month-three retention.
- NN/g, [Empty states](https://www.nngroup.com/articles/empty-state-interface-design/); [Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/).
- Baymard, [Cart abandonment](https://baymard.com/lists/cart-abandonment-rate): 18% quit over account creation; checkouts carry too many fields.
- Nunes and Drèze 2006, [endowed progress](https://www.coglode.com/nuggets/endowed-progress-effect): 34% vs 19% completion.
- Beenen et al. 2004, [CSCW](https://presnick.people.si.umich.edu/papers/cscw04): specific asks and uniqueness raised contributions.
- Facebook's "7 friends in 10 days" ([summary](https://www.news.aakashg.com/p/ultimate-guide-activation)): one threshold action, found from cohort data.


## 6. Shipped 2026-10-16: the ask on the Canvas, finished work included

Rick: new members should post a project they're working on, or add work they've completed, before anything about their profile. As coded until now the phone's Today led with "Your profile is empty", the desktop Canvas never asked for a project, and onboarding had no finished option.

- **Onboarding**: a third pill, **Finished it**, posts the project at stage `completed` (`lib/shareProject.ts` START_STAGES; `createPassionProject` already took a stage). A completed project is the profile's Portfolio (project-ia.md, "Projects, not Portfolios").
- **Canvas, phone and desktop**: one card, **Share a project**, with **Something I'm making** and **Something I finished**, until the member leads any project (`lib/shareProject.ts` ownsAProject reads the public list both screens already load; no new query, so nothing waits on a backend deploy). No close button: it leaves on its own. The phone's "Your profile is empty" card comes after that, and the invite nudge waits until a project is up. Not an admin Update: those archive on "Got it" and can't tell whether the person shared.
- **The form**: `?stage=completed` on the start link (`/projects?new=project` or the Canvas's `?create=project`) opens the same three-step form as "Share your work" and posts a completed project.
- **The project page**: a finished project with no image, link or piece gets "It's up. Add an image or a link." in place of "Invite people" (`InviteToThis`), opening the edit on Show it; the invite card takes over once there is something to look at.

## 7. 2026-10-27: profile first

Rick: new members were confused. Onboarding asked what they were into and sent them to post a project, so their account never got set up: no photo, no address, no line about them. It now finishes the profile first, then walks makers to a project. Phone first, bigger type, one question to a screen.

- **Four steps** (`routes/onboarding.tsx`, one main button each). At the top, Back (steps 2 and up) on the left of a stepper: thin segments that fill citron as they go (`role="progressbar"`, "Step 2 of 4"), with the step's short name under them in 14px dim: You're here to · Your page · About you · Project. A backer or a partner has three segments. The step names and which segments are on are `progressFor` in `lib/onboardingSteps.ts`.
  1. **What brings you here?** The three doors. Picking one goes on.
  2. **Set up your page.** Photo (optional, saved the moment it's picked), name (required, filled in when they already have one; no line of explanation under it), address `thecreative.exchange/@…` (optional, checked as they type, started from their name when they have none). A refused address stays here with its reason. If the name typed is an organization already on the site, a note says to use their own name and add the organization to their profile (the old "Your own name. Organizations get their own page." line that sat under the name all the time is gone).
  3. **About you.** A line about them, then what they're into (a maker), what they want to back (a backer), or what they can offer and their space or organization (a partner). Then **Where are you** (optional, one line: the same place picker as the project form and Settings, saved as "City, ST" the way Settings writes a profile's place), and, only when the account has no email, **Email, so you hear when someone cheers you** (optional). Continue saves the profile, which is what counts as onboarded. A backer or a partner leaves here for the Canvas.
  4. **What are you working on?** Makers only: a title ("A title is enough. Everyone can see it."), **What is it** (optional, two lines, goes to the project as its blurb), where it is, **Share it** or **Not yet**. Only the project is saved here.
- **The step is in the address bar** (`?step=N`), so the browser's Back steps back instead of leaving. A link can't open a step past what's filled in: no door, no step 2; no name, no step 3; a backer or a partner has no step 4. Everyone not yet onboarded is still sent here by the app shell, so the only way out is finishing.
- **A title typed on the front door no longer posts a project on its own.** It fills in step 4 instead, and stays until they share or say Not yet (a reload keeps it). Before, a new member with a name went straight from sign-up to a posted project with no screen at all, and so no photo, address or line about them.
- **The city** is `useLocationField` (starting from the profile's own place) with `LocationAutocomplete` and `LocationVerifiedHint`, exactly as the project form and Settings use them. It replaces the place that onboarding used to pass back untouched, so all five place fields (`location`, `locationType`, `address`, `coordinates`, `placeId`) now come from the field in the one `upsertProfile` call: left alone they are saved as they were, cleared they are cleared, a typed city that was never picked from the list is saved as text only. `keepProfileFields` is gone, since nothing is left to pass back.
- **The email** is asked only when the account has none, which is what a phone sign-up made on the login page leaves: `profiles.getMyProfile` returns `email: null` (it reads the `users` row). It goes in the same `upsertProfile` call as `email`, which the server checks (`That doesn't look like a valid email.`, shown on the screen) and fills in only when the account has none, never replacing one. This is how the first onboarding did it too. The browser's own email check is off (`noValidate`), so the person reads our words.
- **Screens slide.** A new screen comes in from the right going on and from the left going back (the browser's Back too): 240ms, ease-out, `transform` and `opacity` only, and not at all under `prefers-reduced-motion: reduce`. The stepper's fill is a `scale` and stops moving under reduced motion too. The new screen's heading takes focus (without scrolling) so a screen reader lands on it; for that, the title field on step 4 no longer grabs focus itself.
- **Room for a mic** is left beside "A line about you" (step 3) and "What is it" (step 4): the label on the left, 44px of space on the right, marked `MicButton goes here` in `routes/onboarding.tsx`.
- **Coming back to change answers** (Settings, "Change what brings you here") opens on step 1 with their answers, through the same screens; the last button of each path says **Save**.
- **Type and space:** headings 28/34px, questions and fields 17px, pills and helper lines 15px, buttons 17px and 52px tall, a good gap between groups. Helper and placeholder text are the muted token or lighter on ink; the step name under the stepper is 14px in the dim token (6:1).
- **Shared with Settings, not copied:** the address check (`lib/useHandleCheck.ts`, also how Save Profile claims a changed address) and the photo upload (`useFileUpload` with `saveProfileImage`). The steps' logic is `lib/onboardingSteps.ts`.
- **Events:** the same as before (`onboarding_viewed`, `onboarding_door_picked`, `onboarding_project_shared`, `onboarding_not_yet`, `onboarding_backer_exit`, `onboarding_partner_exit`), plus `onboarding_step` with `{ step }` each time a step is shown, which gives the drop-off at each step. `from_front_door` is on `onboarding_project_shared` when the title came from the front door.
- **Not done:** the name is saved with step 3, not step 2, so someone who leaves between them has a photo or address but still shows as unnamed. Going back to step 2 shows what they had.
