# Onboarding: from the invite to a first project

2026-10-27. Proposal for Rick's OK. Tappable prototype: see the artifact link in the session; this doc is the words and the rules.

**The goal.** A new person ends up with a page that looks real (photo, name, address, a line, what they're into) and a first project, in under two minutes, on a phone. Today onboarding asks for interests and a title and nothing else, so people land in the app with an empty page and get confused.

## 1. Before the account: the invite and the home page

Most people arrive by an invite link. That page is where the pull has to be.

**Invite page** (`/signup/:code`), top to bottom:

1. "**Dee invited you to The Garden.**" (the inviter's real name and photo, as now)
2. The benefit line (below).
3. **What people are making this week**: three real projects, each a face, a title and one line. Real data from the public list; no counts, no "be the first".
4. "The first grants go out in November, from projects submitted in October." (canonical claim, `sophia schedule`)
5. "Invite-only. Joining is free."
6. Button: **Accept the invite**.

**Home page** (`/`): the headline becomes the benefit line. The "What are you working on?" box stays; the title it takes rides into step 4 below instead of posting on its own. The same three real projects and the same grant line sit under it.

**The benefit line.** On The Garden's address:

> The place for Christian creatives to connect, collaborate, share their work, get hired and paid.

On thecreative.exchange, the same line with "creatives". It describes the platform, which `claims.md` allows ("Get your work funded" is fine; a promise to a person is not). It goes into `claims.md` as a named claim so the test guards it. "Create better together." retires.

**What we can say to create pull, truthfully:** a named inviter; real work from this week; the grant date; the launch event with its real count ("23 going"); invite-only. **What we can't:** numbers we don't have, "be the first", "your project will get funded", "artist".

## 2. The account

Unchanged: Google (one tap) or a phone code, with the consent line. The "makers, dreamers, and doers" modal after a phone signup goes.

## 3. Onboarding: four screens, one thing each

Every screen has the same shape, the way a phone's setup assistant does:

- A back chevron, top left, and beside it a **stepper** of four thin segments that fill citron as you go, with the step's short name under it in 14px dim (You're here to · Your page · About you · Project; a backer or a partner has three). Not "1 of 4" text. It is an accessible progress bar ("Step 2 of 4").
- One title (28px), at most one helper line (15px), one control.
- One primary button (52px) pinned above the keyboard. A quiet "Later" on optional steps.
- Screens slide: in from the right, and from the left going Back (the chevron or the browser), 240ms, and not at all for someone who asked for less motion. The new screen's heading takes focus. Back keeps what was typed. The photo and the address save as they're set on step 2 and the profile on step 3's Continue, so leaving loses nothing; they resume at the step they left.

| Step | Name | Title | Controls | Button |
|---|---|---|---|---|
| 1 | You're here to | What brings you here? | The three doors (I make things · I back creatives · I have a space or resources). Picking one goes on. | Picking a door goes on; Continue shows once one is picked |
| 2 | Your page | Set up your page | Round photo picker (optional), name (prefilled; no line of explanation under it), `thecreative.exchange/@` + an address suggested from the name, "Available" shows as they type (optional) | Continue |
| 3 | About you | About you | "A line about you" (optional) · the pills for the door they picked (What are you into? · What do you want to back? · What can you offer? + your space or organization) · **Where are you** (optional, the place picker, saved as "City, ST") · **Email, so you hear when someone cheers you** (optional; only when the account has no email, which a phone sign-up leaves) | Continue (a backer or a partner is done after it) |
| 4 | Project | What are you working on? | Title (prefilled from the home box; "A title is enough. Everyone can see it.") · **What is it** (optional, two lines) · Thinking about it · Working on it · Finished it | Share it · Not yet |

Step 3's Continue saves the profile; from there the account counts as set up. Backers and partners skip step 4 and land on the Canvas. Makers land on the project page: "It's up." with **Add an image or a link** and **Invite a friend**. Their project is the first card on the Canvas. Beside "A line about you" and "What is it" there is room (44px) for a mic button, to speak the answer.

## 4. The project form (built, waiting on this proposal)

"Start a project" from the Canvas or Projects is four short screens: What are you making? (title, stage) · Say a bit about it · Show it (a link) · Details (interests, where, community, posted by). No invite talk in the form. 17px inputs. Browser Back and Escape close the sheet; Back inside it never loses text.

## 5. Type and space

Titles 28px Bricolage; questions and inputs 17px (16px or more so iPhones don't zoom); pills and helper lines 15px; buttons 17px, 52px tall. One group per screen; 32–40px between groups. Body text 9:1 on ink, dim text 6:1, nothing under 12px.

## 6. Measure

`onboarding_step` with the step name, plus the events that exist. Watch: finish rate per step, and projects shared within an hour and within seven days.

## Speech on steps 3 and 4 (2026-10-27)

On the "About you" screen a round mic ("Talk instead") takes a spoken sentence ("I'm a wedding photographer who also shoots short films"), fills "A line about you" and lights up the matching interest pills, so nobody hunts through 28 pills. Both stay editable.

What runs where:

- **In the browser:** the Web Speech API (`app/app/lib/useSpeech.ts`, the button is `app/app/components/MicButton.tsx`) turns speech into text. The audio goes to the browser's own speech service (in Chrome, Google's) and nowhere else; we never receive it. Where that API is missing or useless (Firefox, Brave, Chrome on an iPhone, in-app browsers) the browser records the take instead and `convex/transcribe.ts` sends it to OpenAI to write down (2026-10-30; the sound lives for the length of the call and is not stored). The box says "Writing it down…" while the words are on their way. Only a browser that can neither listen nor record draws no mic. The same box (`app/app/components/SpokenTextarea.tsx`, via `useTalk()`) is on the profile's Bio in Settings and the project form's "What is it".
- **On our backend:** one Convex action, `onboardingAssist.pickFromSpeech({ transcript })`, signed-in people only. It makes one OpenAI chat completion (`gpt-4o-mini`) with the key the backend already has (`OPENAI_API_KEY`). The answer is locked to the interest list by a strict JSON schema, then checked again on our side: names not on the list are dropped, no repeats, at most 6, and the line cut to 140 characters. "Other" is never offered to the model. The transcript is capped at 1,500 characters. The interest list has one source, `app/convex/interests.ts`, which the app's `constants/interests.ts` re-exports.

What is stored: nothing. The transcript goes to OpenAI for that one call and isn't saved by us: not in our database, and our own logging never includes it (a failure logs only the status code). What the person keeps is what lands in their profile after they review it: the pills they leave lit and the line.

Cost: about $0.0002 a call (about 500 tokens in and 60 out at `gpt-4o-mini` rates). 10,000 sign-ups that all use it come to about $2. No separate rate limit; it is behind sign-in, and the page should send one call per finished sentence, not one per word.

If it fails (no key, OpenAI down, nothing usable back), the person sees one plain sentence and picks by hand.

## Open questions

1. Keep the door on step 3, or drop it and treat everyone as a creative (backers find Give on their own)?
2. Is the photo required, or is "Later" allowed there too?
3. The benefit line: "get hired and paid" as written, or the claim's words, "find paid work, get backed"?
4. A welcome screen ("You're in, Rick. Three quick things.") before step 1, or straight into it?
