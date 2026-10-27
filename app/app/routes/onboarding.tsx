import { usePostHog } from "@posthog/react";
import { CaretLeft, type Icon } from "@phosphor-icons/react";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState, type FormEvent, type MutableRefObject, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { HANDLE_MAX_LENGTH } from "../../convex/handleRules";
import { hasRealName } from "../../convex/names";

import { INTERESTS } from "../constants/interests";
import { interestIcon } from "../constants/interestIcons";
import { DOORS, PARTNER_OFFERINGS, type Role } from "../constants/roles";
import { LocationAutocomplete, LocationVerifiedHint } from "../components/LocationAutocomplete";
import { MicButton } from "../components/MicButton";
import { PersonAvatar } from "../components/PersonAvatar";
import { DESK_PATH } from "../desk/deskState";
import { GARDEN_SLUG } from "../lib/communitySlugs";
import { errorMessage } from "../lib/convexError";
import { justPublished } from "../lib/justPublished";
import { needsOnboarding } from "../lib/onboardingGate";
import {
  aboutYouArgs,
  cityLabel,
  lacksEmail,
  nextStep,
  previousStep,
  progressFor,
  reachableStep,
  slideFor,
  stepFromParam,
  stepHref,
  suggestHandle,
  type Slide,
  type Step,
} from "../lib/onboardingSteps";
import {
  START_STAGES,
  dropShareProjectIntent,
  peekStashedProjectTitle,
  type StartStage,
} from "../lib/shareProject";
import { AVATAR_PX } from "../lib/shrinkImage";
import { toggled } from "../lib/toggled";
import { useBack } from "../lib/useBack";
import { useFileUpload } from "../lib/useFileUpload";
import { claimPendingAddress, useHandleCheck } from "../lib/useHandleCheck";
import { useLocationField } from "../lib/useLocationField";
import { useSpeech } from "../lib/useSpeech";

// What a new account sees, one question to a screen (Rick, 2026-10-27: new
// members only answered "what are you into" and were sent to post a project,
// so their account never got set up. The profile comes first now):
//   1. what brings you here   2. photo, name and address
//   3. a line about you, what you're into and a city, plus an email when the
//      account has none (a backer or a partner is done)
//   4. a project (makers only): a title, what it is, where it is
// The step rides in the URL (?step=N), so the browser's Back steps back. A
// stepper of segments shows where they are, and each new screen slides in
// (from the left going back) and takes focus on its heading.
// Agreements are taken at account creation, not here. The steps themselves
// are lib/onboardingSteps.ts.
//
// Saving the profile on step 3 records a primaryRole, which is what the app
// reads as "onboarding done" (lib/onboardingGate.ts). The photo and the
// address are saved as they're set on step 2, since each is its own record;
// the name waits for step 3 with the rest (the city and the email go with
// it).

// What the project's visibility is today, said under the title. A project is
// tagged with The Garden but listed to everyone: there is no community-only
// setting yet (convex/garden/projects.ts listProjects shows every posted
// project; garden/communityVisibility.ts only hides test communities). Change
// this line the day one exists.
const VISIBILITY_NOTE = "Everyone can see it.";

// Colors are the Garden tokens (public/tokens.css). Error text is lighter than
// the usual red so it reads ~9:1 on ink.
const INK = "var(--garden-ink)";
const RAISED = "var(--garden-ink-raised)";
const PAPER = "var(--garden-paper)";
const BODY = "var(--garden-body)";
const MUTED = "var(--garden-muted)";
const DIM = "var(--garden-dim)";
const CITRON = "var(--garden-citron)";
const LINE = "var(--garden-hairline-raised)";
const ERROR = "#fca5a5";

// The type scale (Rick: bigger, with room to breathe; nothing under 12px,
// and body text 9:1 or better on ink): questions and fields 17px (16 or more
// keeps iOS from zooming into a field), pills and helper lines 15px, buttons
// 17px and 52px tall.
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fee268]";
const FOCUS_WITHIN = "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#fee268]";
const LABEL = "block text-[17px] font-medium";
const FIELD = `w-full px-4 py-3 rounded-xl border text-[17px] placeholder:text-[var(--garden-muted)] ${FOCUS}`;
const HELP = "mt-2 text-[15px]";
const PILL = `inline-flex items-center gap-2 min-h-10 px-4 py-2 rounded-full border text-[15px] font-medium transition-colors ${FOCUS}`;
const BUTTON = `min-h-[52px] px-4 rounded-xl text-[17px] disabled:opacity-50 ${FOCUS}`;

// A new screen slides in from the right going on, from the left going back:
// 240ms, transform and opacity only, and not at all for someone who asked
// their system for less motion. The screen's end state is its resting one, so
// nothing is left holding a transform.
const SLIDE_CSS = `
@keyframes onb-from-right { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: none; } }
@keyframes onb-from-left { from { opacity: 0; transform: translateX(-24px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: no-preference) {
  .onb-from-right { animation: onb-from-right 240ms ease-out; }
  .onb-from-left { animation: onb-from-left 240ms ease-out; }
}
`;
// LocationAutocomplete draws its own box (white and gray, 14px text); this
// makes it the same box as the other fields here. Its classes come first, so
// each of these is marked important.
const CITY_FIELD = `text-[17px] py-3! rounded-xl! bg-[var(--garden-ink-raised)]! border-[color:var(--garden-hairline-raised)]! text-[color:var(--garden-paper)]! placeholder:text-[color:var(--garden-muted)]! focus:ring-0! ${FOCUS}`;
const SLIDE_CLASS: Record<Slide, string> = { forward: "onb-from-right", back: "onb-from-left" };

type MyProfile = NonNullable<FunctionReturnType<typeof api.profiles.getMyProfile>>;

/** What has been answered so far. It lives above the steps, so Back finds
 *  every screen as it was left. */
type Draft = {
  role: Role | null;
  name: string;
  /** What's typed in the address field. Null until they touch it: the field
   *  shows the address their name suggests. */
  handle: string | null;
  bio: string;
  interests: string[];
  offerings: string[];
  /** A partner's space or organization: it gets its own page, with them on it
   *  (profiles.upsertProfile links orgName to an organization). */
  placeName: string;
  /** Only asked when the account has no email (lacksEmail). */
  email: string;
  title: string;
  /** What the project is, in a line or two. */
  blurb: string;
  stage: StartStage | null;
};
type SetDraft = <K extends keyof Draft>(key: K, value: Draft[K]) => void;

/** Someone already onboarded can come back to change their answers (Rick,
 *  2026-10-10: "a way to let people update their preferences"): the screens
 *  open on what they chose before. A new member starts empty, with the name
 *  they signed in with (Google gives one). Either way, a title typed on the
 *  front door fills in the project step. Nothing is saved until a button is
 *  pressed. */
function startingDraft(profile: MyProfile, returning: boolean): Draft {
  const was = returning ? (DOORS.find((d) => d.role === profile.primaryRole)?.role ?? null) : null;
  return {
    role: was,
    name: hasRealName(profile.name) ? profile.name : "",
    handle: null,
    bio: profile.bio ?? "",
    interests: (was === "patron" ? profile.supportInterests : profile.interests) ?? [],
    offerings: profile.partnerOfferings ?? [],
    placeName: "",
    email: "",
    title: peekStashedProjectTitle() ?? "",
    blurb: "",
    stage: null,
  };
}

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: INK }}>
      <div
        className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: CITRON, borderTopColor: "transparent" }}
      />
    </div>
  );
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();

  const profile = useQuery(api.profiles.getMyProfile);
  // The Garden's own rules for who may post into it, and the communities this
  // account is in: the project is posted into The Garden, as the project form
  // does by default.
  const signupCommunity = useQuery(api.garden.defaultCommunity.getSignupCommunity, isAuthenticated ? {} : "skip");
  const myCommunities = useQuery(api.garden.communities.listMyCommunities, isAuthenticated ? {} : "skip");
  const gardenId = myCommunities?.find((c) => c.slug === GARDEN_SLUG && c.status === "active")?._id;

  // Set when a button is pressed: an invite-only Garden's bounce to /invite
  // (below) must not pull the page away from a save or a share in progress.
  const left = useRef(false);

  // Same order as the app shell (routes/_app.tsx): an invite-only Garden comes
  // before onboarding, and nobody posts into it without being in it.
  const mustInvite =
    !!signupCommunity?.inviteOnly && signupCommunity.viewer?.isMember === false && !profile?.isAdmin;

  // This route sits outside the _app layout, so nothing else bounces a
  // signed-out visitor — without this they'd see the spinner forever.
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login?redirect=/onboarding", { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (mustInvite && !left.current) navigate("/invite", { replace: true });
  }, [mustInvite, navigate]);

  if (!isAuthenticated || !profile || signupCommunity === undefined || myCommunities === undefined || mustInvite) {
    return <Spinner />;
  }
  return <OnboardingFlow profile={profile} gardenId={gardenId} left={left} />;
}

function OnboardingFlow({
  profile,
  gardenId,
  left,
}: {
  profile: MyProfile;
  gardenId: Id<"hostOrgs"> | undefined;
  left: MutableRefObject<boolean>;
}) {
  const navigate = useNavigate();
  const posthog = usePostHog();
  const [params] = useSearchParams();

  // Decided once, on the way in: saving the profile on step 3 makes a new
  // member read as onboarded too, and the wording must not change under them.
  const [returning] = useState(() => !needsOnboarding(profile));
  const [draft, setDraft] = useState(() => startingDraft(profile, returning));
  const set: SetDraft = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const { role } = draft;
  // The city lives up here with the rest of the answers, so Back finds it as
  // it was left. It starts from the profile's own.
  const city = useLocationField(profile);

  // A title typed on the front door (components/ShareTitleBox.tsx) before the
  // account existed fills in step 4. It's remembered so the share event can
  // say the project began there.
  const [frontDoorTitle] = useState(draft.title);

  // A link may not open a step past what's filled in; the address bar then
  // says where they really are.
  const step = reachableStep(stepFromParam(params.get("step")), draft);
  const bar = progressFor(role, step);
  useEffect(() => {
    const asked = params.get("step");
    if (asked !== null && asked !== String(step)) navigate(stepHref(step), { replace: true });
  }, [params, step, navigate]);
  const goTo = (to: Step) => navigate(stepHref(to));
  // Going forward adds a history entry, so Back is the browser's own.
  const previous = previousStep(step) ?? 1;
  const back = useBack(stepHref(previous));

  // Which way the screen on show came in from. The first one just appears.
  // (Set while rendering, the way React derives state from a changed value:
  // the browser's own Back and Forward change the step too.)
  const [shown, setShown] = useState<{ step: Step; slide: Slide | null }>({ step, slide: null });
  if (shown.step !== step) setShown({ step, slide: slideFor(shown.step, step) });

  // A new screen's heading takes focus, so a screen reader lands on it. Not on
  // the way in (the first screen just opens), and without scrolling to it:
  // ScrollRestoration already puts the page at the top for the new address.
  const screen = useRef<HTMLDivElement>(null);
  const focusedStep = useRef(step);
  useEffect(() => {
    if (focusedStep.current === step) return;
    focusedStep.current = step;
    screen.current?.querySelector("h1")?.focus({ preventScroll: true });
  }, [step]);

  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    posthog?.capture("onboarding_viewed", { needs_name: !hasRealName(profile.name) });
  }, [profile.name, posthog]);
  const reported = useRef<Step | null>(null);
  useEffect(() => {
    if (reported.current === step) return;
    reported.current = step;
    posthog?.capture("onboarding_step", { step });
  }, [step, posthog]);

  function pickDoor(next: Role) {
    set("role", next);
    posthog?.capture("onboarding_door_picked", { door: next });
    goTo(2);
  }

  return (
    <main
      className="min-h-screen flex justify-center overflow-x-clip px-5 pt-4 pb-14 sm:pt-12"
      style={{ backgroundColor: INK, color: BODY }}
    >
      <style>{SLIDE_CSS}</style>
      <div className="w-full max-w-[40rem]">
        <div className="flex min-h-11 items-center">
          {/* The Back link's place is kept on the first step too, so the
              segments don't move when it appears. */}
          <div className="w-20 shrink-0">
            {step > 1 && (
              <Link
                {...back}
                className={`-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[17px] font-medium ${FOCUS}`}
                style={{ color: BODY }}
              >
                <CaretLeft size={20} weight="regular" aria-hidden />
                Back
              </Link>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div
              role="progressbar"
              aria-label={bar.label}
              aria-valuenow={bar.current}
              aria-valuemax={bar.total}
              className="flex gap-1.5"
            >
              {bar.segments.map((on, i) => (
                <span
                  key={i}
                  className="h-1 flex-1 overflow-hidden rounded-full"
                  style={{ backgroundColor: LINE }}
                >
                  <span
                    className={`block h-full origin-left rounded-full transition-transform duration-[240ms] ease-out motion-reduce:transition-none ${
                      on ? "scale-x-100" : "scale-x-0"
                    }`}
                    style={{ backgroundColor: CITRON }}
                  />
                </span>
              ))}
            </div>
            <p className="mt-2 text-[14px]" style={{ color: DIM }}>
              {bar.name}
            </p>
          </div>
        </div>

        <div key={step} ref={screen} className={shown.slide ? SLIDE_CLASS[shown.slide] : undefined}>
          {step === 1 && <DoorStep role={role} onPick={pickDoor} onContinue={() => goTo(2)} />}
          {step === 2 && <PageStep profile={profile} draft={draft} set={set} onDone={() => goTo(3)} />}
          {step === 3 && role && (
            <AboutStep
              role={role}
              profile={profile}
              draft={draft}
              set={set}
              city={city}
              returning={returning}
              left={left}
              onDone={goTo}
            />
          )}
          {step === 4 && (
            <ProjectStep
              draft={draft}
              set={set}
              returning={returning}
              gardenId={gardenId}
              fromFrontDoor={!!frontDoorTitle && draft.title.trim() === frontDoorTitle}
              left={left}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <h1
      // Focused when its screen opens (OnboardingFlow), so no ring on it.
      tabIndex={-1}
      className="mt-6 text-[28px] sm:text-[34px] font-semibold leading-tight outline-none"
      style={{ color: PAPER, fontFamily: "var(--garden-font-display)", textWrap: "balance" }}
    >
      {children}
    </h1>
  );
}

/** The most of a transcript the pick takes: onboardingAssist's
 *  MAX_TRANSCRIPT, kept here because that module is the server's. */
const SPOKEN_MAX = 1500;

/** Talk instead. While the browser listens, the words go into the field as
 *  they're said (`onWords`); once it stops (a tap on Stop, or silence), the
 *  whole of what was said goes to `onSaid`, which may tidy or sort it. A new
 *  start begins a fresh transcript. */
function useSpoken(
  speech: ReturnType<typeof useSpeech>,
  onWords: (said: string) => void,
  onSaid?: (said: string) => void | Promise<void>,
) {
  const was = useRef(false);
  useEffect(() => {
    if (speech.listening) onWords(speech.transcript);
    // onWords is an inline setter; the words are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.listening, speech.transcript]);
  useEffect(() => {
    const said = speech.transcript.trim().slice(0, SPOKEN_MAX);
    if (was.current && !speech.listening && said && onSaid) void onSaid(said);
    was.current = speech.listening;
    // Runs on the edge of listening only; the transcript is complete by then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.listening]);
  return {
    start: () => {
      speech.reset();
      speech.start();
    },
  };
}

/** Under a field with a mic: what's happening, or what went wrong. */
function SpokenNote({ listening, working, error }: { listening: boolean; working: boolean; error: string | null }) {
  const text = error || (listening ? "Listening. Tap the mic to stop." : working ? "Sorting that out…" : null);
  if (!text) return null;
  return (
    <p role={error ? "alert" : "status"} className={HELP} style={{ color: error ? ERROR : BODY }}>
      {text}
    </p>
  );
}

function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className={HELP} style={{ color: ERROR }}>
      {children}
    </p>
  );
}

type PillOption<V extends string> = { value: V; label: string; Icon?: Icon };

const INTEREST_OPTIONS: PillOption<string>[] = INTERESTS.map((tag) => ({
  value: tag,
  label: tag,
  Icon: interestIcon(tag),
}));
const OFFERING_OPTIONS: PillOption<string>[] = PARTNER_OFFERINGS.map((offering) => ({
  value: offering,
  label: offering,
}));

/** A question answered by pressing any of a few pills. */
function Pills<V extends string>({
  label,
  hideLabel = false,
  options,
  isOn,
  onPress,
}: {
  label: string;
  /** For a group the pills explain themselves: read out, not shown. */
  hideLabel?: boolean;
  options: readonly PillOption<V>[];
  isOn: (value: V) => boolean;
  onPress: (value: V) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className={hideLabel ? "sr-only" : `${LABEL} mb-3`} style={{ color: PAPER }}>
        {label}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map(({ value, label: text, Icon }) => {
          const on = isOn(value);
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              onClick={() => onPress(value)}
              className={PILL}
              style={{
                backgroundColor: on ? CITRON : RAISED,
                borderColor: on ? CITRON : LINE,
                color: on ? INK : BODY,
              }}
            >
              {Icon && <Icon size={18} weight="regular" aria-hidden />}
              {text}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Step 1: the three doors. Picking one goes on; a door already chosen (an
 *  earlier pass, or Back) also has Continue. */
function DoorStep({
  role,
  onPick,
  onContinue,
}: {
  role: Role | null;
  onPick: (role: Role) => void;
  onContinue: () => void;
}) {
  return (
    <div>
      <Heading>What brings you here?</Heading>
      <div role="radiogroup" aria-label="What brings you here?" className="mt-8 grid gap-3">
        {DOORS.map((d) => {
          const on = role === d.role;
          return (
            <button
              key={d.role}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onPick(d.role)}
              className={`text-left rounded-2xl border px-5 py-4 transition-colors ${FOCUS}`}
              style={{ backgroundColor: on ? CITRON : RAISED, borderColor: on ? CITRON : LINE }}
            >
              <span className="block text-[17px] font-semibold" style={{ color: on ? INK : PAPER }}>
                {d.label}
              </span>
              <span className="mt-1 block text-[15px]" style={{ color: on ? INK : BODY }}>
                {d.hint}
              </span>
            </button>
          );
        })}
      </div>
      {role && (
        <button
          type="button"
          onClick={onContinue}
          className={`mt-8 w-full ${BUTTON} font-semibold`}
          style={{ backgroundColor: CITRON, color: INK }}
        >
          Continue
        </button>
      )}
    </div>
  );
}

/** Said only when the name typed is an organization already on the site (an
 *  account is a person; Rick, 2026-10-10). The line that used to sit under the
 *  name all the time, "Your own name. Organizations get their own page.", is
 *  gone (Rick, 2026-10-27: half the words). The same note as
 *  components/PersonNameHint.tsx, which signup still shows in full. */
function OrganizationNameNote({ name }: { name: string }) {
  const typed = name.trim();
  const match = useQuery(api.organizations.matchByName, typed.length >= 3 ? { name: typed } : "skip");
  if (!match) return null;
  return (
    <p role="alert" className={`${HELP} text-amber-300`}>
      {match.name} is an organization here. Use your own name, then add {match.name} to your profile.
    </p>
  );
}

/** Step 2: the page itself. The photo is saved the moment it's picked; the
 *  address is claimed on Continue. */
function PageStep({
  profile,
  draft,
  set,
  onDone,
}: {
  profile: MyProfile;
  draft: Draft;
  set: SetDraft;
  onDone: () => void;
}) {
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const saveProfileImage = useMutation(api.files.saveProfileImage);
  const claimHandle = useMutation(api.handles.claimHandle);
  const fileInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const addressInput = useRef<HTMLInputElement>(null);

  const photo = useFileUpload({
    kinds: ["image"],
    generateUploadUrl,
    square: AVATAR_PX,
    onUploaded: ({ storageId }) => saveProfileImage({ storageId }),
  });
  const photoUrl = photo.preview ?? profile.imageUrl;

  const current = profile.handle ?? "";
  const typed = draft.handle ?? (current || suggestHandle(draft.name));
  const address = useHandleCheck(typed, current);

  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState("");
  const [addressError, setAddressError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || photo.uploading) return;
    if (!hasRealName(draft.name)) {
      setNameError("Enter your name.");
      nameInput.current?.focus();
      return;
    }
    setNameError("");
    setAddressError(null);
    setBusy(true);
    // A refused address keeps them here, with its reason showing.
    const result = await claimPendingAddress(address, (handle) => claimHandle({ handle }));
    setBusy(false);
    if (!result.ok) {
      setAddressError(result.error);
      addressInput.current?.focus();
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <Heading>Set up your page</Heading>

      <div className="mt-8 flex items-center gap-5">
        <PersonAvatar name={draft.name} imageUrl={photoUrl} size="xl" tone="garden" />
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          onChange={(e) => void photo.onPick(e)}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={photo.uploading}
          className={`${BUTTON} border font-medium`}
          style={{ borderColor: LINE, color: PAPER }}
        >
          {photo.uploading ? "Uploading…" : photoUrl ? "Change photo" : "Add a photo"}
        </button>
      </div>
      {photo.error && <ErrorLine>{photo.error}</ErrorLine>}

      <div className="mt-10">
        <label htmlFor="onboarding-name" className={LABEL} style={{ color: PAPER }}>
          Your name
        </label>
        <input
          id="onboarding-name"
          ref={nameInput}
          type="text"
          autoComplete="name"
          value={draft.name}
          onChange={(e) => {
            set("name", e.target.value);
            setNameError("");
          }}
          aria-invalid={!!nameError || undefined}
          className={`mt-3 ${FIELD}`}
          style={{ backgroundColor: RAISED, borderColor: nameError ? ERROR : LINE, color: PAPER }}
        />
        <OrganizationNameNote name={draft.name} />
        {nameError && <ErrorLine>{nameError}</ErrorLine>}
      </div>

      <div className="mt-10">
        <label htmlFor="onboarding-address" className={LABEL} style={{ color: PAPER }}>
          Your address (optional)
        </label>
        <div
          className={`mt-3 flex items-center rounded-xl border ${FOCUS_WITHIN}`}
          style={{ backgroundColor: RAISED, borderColor: address.refused ? ERROR : LINE }}
        >
          <span className="pl-4 text-[15px] whitespace-nowrap select-none" style={{ color: MUTED }}>
            thecreative.exchange/@
          </span>
          <input
            id="onboarding-address"
            ref={addressInput}
            type="text"
            // A handle, not a street address: keep browser autofill out.
            autoComplete="off"
            value={typed}
            onChange={(e) => {
              set("handle", e.target.value);
              setAddressError(null);
            }}
            placeholder="yourname"
            aria-invalid={address.refused || undefined}
            aria-describedby={address.status ? "onboarding-address-status" : undefined}
            maxLength={HANDLE_MAX_LENGTH + 1}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent py-3 pr-4 text-[17px] outline-none placeholder:text-[var(--garden-muted)]"
            style={{ color: PAPER }}
          />
        </div>
        {address.status && (
          <p
            id="onboarding-address-status"
            role={address.refused ? "alert" : "status"}
            className={HELP}
            style={{ color: address.refused ? ERROR : BODY }}
          >
            {address.status}
          </p>
        )}
        {addressError && <ErrorLine>{addressError}</ErrorLine>}
      </div>

      <button
        type="submit"
        disabled={busy || photo.uploading}
        className={`mt-10 w-full ${BUTTON} font-semibold`}
        style={{ backgroundColor: CITRON, color: INK }}
      >
        {busy ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}

/** Step 3: a line about them, what they're into and where they are (and an
 *  email, when the account has none). Saving it is what makes the account
 *  onboarded. A backer or a partner leaves here; a maker goes on to the
 *  project. */
function AboutStep({
  role,
  profile,
  draft,
  set,
  city,
  returning,
  left,
  onDone,
}: {
  role: Role;
  profile: MyProfile;
  draft: Draft;
  set: SetDraft;
  city: ReturnType<typeof useLocationField>;
  returning: boolean;
  left: MutableRefObject<boolean>;
  onDone: (step: Step) => void;
}) {
  const navigate = useNavigate();
  const posthog = usePostHog();
  const upsertProfile = useMutation(api.profiles.upsertProfile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const next = nextStep(role, 3);
  const askEmail = lacksEmail(profile);

  // Talk instead (Rick, 2026-10-27): the words land in the line as they're
  // said; when listening ends, pickFromSpeech tidies the line and lights the
  // pills that fit, so nobody hunts through them. Nothing is saved until
  // Continue, same as typing.
  const speech = useSpeech();
  const pickFromSpeech = useAction(api.onboardingAssist.pickFromSpeech);
  const [sorting, setSorting] = useState(false);
  const [micError, setMicError] = useState("");
  const heard = useSpoken(speech, (said) => set("bio", said), async (said) => {
    setSorting(true);
    setMicError("");
    try {
      const pick = await pickFromSpeech({ transcript: said });
      if (pick.line) set("bio", pick.line);
      if (pick.interests.length > 0) set("interests", Array.from(new Set([...draft.interests, ...pick.interests])));
    } catch (err) {
      setMicError(errorMessage(err));
    } finally {
      setSorting(false);
    }
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    left.current = true;
    setError("");
    setBusy(true);
    try {
      await upsertProfile(
        aboutYouArgs(role, {
          ...draft,
          place: city.toArgs(),
          // The server fills in a missing email and never replaces one.
          email: askEmail ? draft.email : undefined,
        }),
      );
      if (next) {
        setBusy(false);
        onDone(next);
        return;
      }
      posthog?.capture(role === "patron" ? "onboarding_backer_exit" : "onboarding_partner_exit", {
        interests: draft.interests.length,
        offerings: draft.offerings.length,
        title_typed: !!draft.title.trim(),
      });
      dropShareProjectIntent();
      navigate(DESK_PATH, { replace: true });
    } catch (err) {
      console.error("Onboarding failed:", err);
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    // noValidate: a badly typed email is told so by the server, in our words.
    <form onSubmit={(e) => void submit(e)} noValidate>
      <Heading>About you</Heading>

      <div className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="onboarding-bio" className={LABEL} style={{ color: PAPER }}>
            A line about you (optional)
          </label>
          <MicButton listening={speech.listening} onStart={heard.start} onStop={speech.stop} />
        </div>
        <textarea
          id="onboarding-bio"
          rows={2}
          value={draft.bio}
          onChange={(e) => set("bio", e.target.value)}
          placeholder="Who you are, in a sentence"
          className={`mt-1 resize-none ${FIELD}`}
          style={{ backgroundColor: RAISED, borderColor: LINE, color: PAPER }}
        />
        <SpokenNote listening={speech.listening} working={sorting} error={speech.error ?? micError} />
      </div>

      {role === "partner" ? (
        <>
          <div className="mt-10">
            <Pills
              label="What can you offer?"
              options={OFFERING_OPTIONS}
              isOn={(value) => draft.offerings.includes(value)}
              onPress={(value) => set("offerings", toggled(draft.offerings, value))}
            />
          </div>
          <div className="mt-10">
            <label htmlFor="onboarding-place" className={LABEL} style={{ color: PAPER }}>
              Your space or organization (optional)
            </label>
            <input
              id="onboarding-place"
              type="text"
              value={draft.placeName}
              onChange={(e) => set("placeName", e.target.value)}
              placeholder="Radius Coffee"
              className={`mt-3 ${FIELD}`}
              style={{ backgroundColor: RAISED, borderColor: LINE, color: PAPER }}
            />
            <p className={HELP} style={{ color: BODY }}>
              It gets its own page. You sign in as yourself.
            </p>
          </div>
        </>
      ) : (
        <div className="mt-10">
          <Pills
            label={role === "creative" ? "What are you into?" : "What do you want to back?"}
            options={INTEREST_OPTIONS}
            isOn={(value) => draft.interests.includes(value)}
            onPress={(value) => set("interests", toggled(draft.interests, value))}
          />
        </div>
      )}

      <div role="group" aria-labelledby="onboarding-city-label" className="mt-10">
        <div id="onboarding-city-label" className={LABEL} style={{ color: PAPER }}>
          Where are you (optional)
        </div>
        <div className="mt-3">
          <LocationAutocomplete
            value={city.value}
            onChange={city.onChange}
            // The same "City, ST" Settings writes for a profile.
            onSelect={(place) => city.onSelect(place, cityLabel(place))}
            placeholder="Search for your city"
            className={CITY_FIELD}
          />
        </div>
        <LocationVerifiedHint value={city.value} selected={city.selected} />
      </div>

      {askEmail && (
        <div className="mt-10">
          <label htmlFor="onboarding-email" className={LABEL} style={{ color: PAPER }}>
            Email, so you hear when someone cheers you (optional)
          </label>
          <input
            id="onboarding-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={draft.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="you@example.com"
            className={`mt-3 ${FIELD}`}
            style={{ backgroundColor: RAISED, borderColor: LINE, color: PAPER }}
          />
        </div>
      )}

      {error && <ErrorLine>{error}</ErrorLine>}

      <button
        type="submit"
        disabled={busy}
        className={`mt-10 w-full ${BUTTON} font-semibold`}
        style={{ backgroundColor: CITRON, color: INK }}
      >
        {busy ? "Saving…" : returning && !next ? "Save" : "Continue"}
      </button>
    </form>
  );
}

/** Step 4, makers only: the smallest project that answers "what are you
 *  working on", a title, and a line or two on what it is if they like. Only
 *  the project is saved here; the profile was saved on step 3. */
function ProjectStep({
  draft,
  set,
  returning,
  gardenId,
  fromFrontDoor,
  left,
}: {
  draft: Draft;
  set: SetDraft;
  returning: boolean;
  gardenId: Id<"hostOrgs"> | undefined;
  fromFrontDoor: boolean;
  left: MutableRefObject<boolean>;
}) {
  const navigate = useNavigate();
  const posthog = usePostHog();
  const createPassionProject = useMutation(api.garden.projects.createPassionProject);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Talk instead: what they say is the description, as said; no sorting
  // to do here.
  const speech = useSpeech();
  const heard = useSpoken(speech, (said) => set("blurb", said));

  async function share(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const title = draft.title.trim();
    if (!title) {
      setError("Give it a title.");
      return;
    }
    left.current = true;
    setError("");
    setBusy(true);
    try {
      const { projectId } = await createPassionProject({
        title,
        blurb: draft.blurb.trim() || undefined,
        stage: draft.stage ?? undefined,
        hostOrgId: gardenId,
      });
      posthog?.capture("onboarding_project_shared", {
        stage: draft.stage ?? "planning",
        interests: draft.interests.length,
        in_garden: !!gardenId,
        ...(fromFrontDoor ? { from_front_door: true } : {}),
      });
      dropShareProjectIntent();
      // Its page offers "Invite people" once (components/InviteToThis.tsx).
      navigate(justPublished(`/projects/${projectId}`), { replace: true });
    } catch (err) {
      console.error("Onboarding failed:", err);
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  function notYet() {
    left.current = true;
    posthog?.capture("onboarding_not_yet", {
      interests: draft.interests.length,
      offerings: draft.offerings.length,
      title_typed: !!draft.title.trim(),
    });
    dropShareProjectIntent();
    navigate(DESK_PATH, { replace: true });
  }

  return (
    <form onSubmit={(e) => void share(e)}>
      <Heading>What are you working on?</Heading>

      <div className="mt-8">
        {/* No autoFocus: the heading takes focus when this screen opens. */}
        <input
          id="onboarding-title"
          type="text"
          aria-label="Project title"
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Title"
          className={FIELD}
          style={{ backgroundColor: RAISED, borderColor: LINE, color: PAPER }}
        />
        <p className={HELP} style={{ color: BODY }}>
          A title is enough. {VISIBILITY_NOTE}
        </p>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="onboarding-blurb" className={LABEL} style={{ color: PAPER }}>
            What is it (optional)
          </label>
          <MicButton listening={speech.listening} onStart={heard.start} onStop={speech.stop} />
        </div>
        <textarea
          id="onboarding-blurb"
          rows={2}
          value={draft.blurb}
          onChange={(e) => set("blurb", e.target.value)}
          placeholder={draft.stage === "completed" ? "What you made, and why" : "What you're making, and why"}
          className={`mt-1 resize-none ${FIELD}`}
          style={{ backgroundColor: RAISED, borderColor: LINE, color: PAPER }}
        />
        <SpokenNote listening={speech.listening} working={false} error={speech.error} />
      </div>

      <div className="mt-8">
        <Pills
          label="Where it is"
          hideLabel
          options={START_STAGES}
          isOn={(value) => draft.stage === value}
          onPress={(value) => set("stage", draft.stage === value ? null : value)}
        />
      </div>

      {error && <ErrorLine>{error}</ErrorLine>}

      <button
        type="submit"
        disabled={!draft.title.trim() || busy}
        className={`mt-10 w-full ${BUTTON} font-semibold`}
        style={{ backgroundColor: CITRON, color: INK }}
      >
        {busy ? "Sharing…" : "Share it"}
      </button>
      {/* A real button, not a faint link: on a phone it's the way past a
          project you aren't ready to share. */}
      <button
        type="button"
        onClick={notYet}
        disabled={busy}
        className={`mt-3 w-full ${BUTTON} border font-medium`}
        style={{ borderColor: LINE, color: PAPER }}
      >
        {returning ? "Save" : "Not yet"}
      </button>
    </form>
  );
}
