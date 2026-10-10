import { usePostHog } from "@posthog/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../../convex/_generated/api";

import { INTERESTS } from "../constants/interests";
import { DOORS, PARTNER_OFFERINGS, type Role } from "../constants/roles";
import { PersonNameHint } from "../components/PersonNameHint";
import { interestIcon } from "../constants/interestIcons";
import { DESK_PATH } from "../desk/deskState";
import { GARDEN_SLUG } from "../lib/communitySlugs";
import { errorMessage } from "../lib/convexError";
import { justPublished } from "../lib/justPublished";
import { needsOnboarding } from "../lib/onboardingGate";
import {
  START_STAGES,
  dropShareProjectIntent,
  hasNameIfNeeded,
  keepProfileFields,
  roleForExit,
  type OnboardingExit,
  type StartStage,
} from "../lib/shareProject";

// The one screen a new account sees (Rick, 2026-10-09): what are you
// interested in or working on, with the smallest project that answers it, a
// title. Role, details and first-work steps used to come first; they wait for
// the Canvas now. Agreements are taken at account creation, not here.
//
// Every way off the screen records a primaryRole, which is what the app reads
// as "onboarding done" (lib/onboardingGate.ts). Nothing is saved before a
// button is pressed.

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
const CITRON = "var(--garden-citron)";
const LINE = "var(--garden-hairline-raised)";
const ERROR = "#fca5a5";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fee268]";
const FIELD = `w-full px-3.5 py-2.5 rounded-lg border text-[15px] ${FOCUS}`;
const PILL = `px-3 py-1.5 rounded-full border text-[13.5px] font-medium transition-colors ${FOCUS}`;
const QUIET = `text-[13.5px] font-medium underline underline-offset-4 disabled:opacity-50 ${FOCUS}`;

export default function Onboarding() {
  const navigate = useNavigate();
  const posthog = usePostHog();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();

  const profile = useQuery(api.profiles.getMyProfile);
  // The Garden's own rules for who may post into it, and the communities this
  // account is in: the project is posted into The Garden, as the project form
  // does by default.
  const signupCommunity = useQuery(api.garden.defaultCommunity.getSignupCommunity, isAuthenticated ? {} : "skip");
  const myCommunities = useQuery(api.garden.communities.listMyCommunities, isAuthenticated ? {} : "skip");
  const gardenId = myCommunities?.find((c) => c.slug === GARDEN_SLUG && c.status === "active")?._id;

  const upsertProfile = useMutation(api.profiles.upsertProfile);
  const createPassionProject = useMutation(api.garden.projects.createPassionProject);

  // Which door: a maker, a backer or a partner. Nothing else shows until one
  // is picked, and the rest of the screen asks what fits it.
  const [role, setRole] = useState<Role | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [offerings, setOfferings] = useState<string[]>([]);
  // A partner's space or organization: it gets its own page, with them on it
  // (profiles.upsertProfile links orgName to an organization).
  const [placeName, setPlaceName] = useState("");
  const [title, setTitle] = useState("");
  const [stage, setStage] = useState<StartStage | null>(null);
  // Only asked when the profile has no real name yet (a phone sign-in made on
  // the login page); never shown twice.
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  // Which button was pressed, until the page changes or it fails.
  const [busy, setBusy] = useState<OnboardingExit | null>(null);
  // Set when a button is pressed. Saving the role makes the profile read as
  // "onboarded", and the page must not bounce away from a failed share.
  const left = useRef(false);

  const needsName =
    profile !== null && profile !== undefined && (!profile.name?.trim() || profile.name === "New User");
  // Same order as the app shell (routes/_app.tsx): an invite-only Garden comes
  // before onboarding, and nobody posts into it without being in it.
  const mustInvite =
    !!signupCommunity?.inviteOnly && signupCommunity.viewer?.isMember === false && !profile?.isAdmin;
  const onboarded = profile !== null && profile !== undefined && !needsOnboarding(profile);

  // This route sits outside the _app layout, so nothing else bounces a
  // signed-out visitor — without this they'd see the spinner forever.
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login?redirect=/onboarding", { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Someone already onboarded can come back to change their answers (Rick,
  // 2026-10-10: "a way to let people update their preferences"). The screen
  // opens on what they chose before; nothing is saved until a button.
  const [returning, setReturning] = useState<boolean | null>(null);
  useEffect(() => {
    if (!profile || returning !== null) return;
    setReturning(onboarded);
    if (!onboarded) return;
    const was = DOORS.find((d) => d.role === profile.primaryRole)?.role ?? null;
    setRole(was);
    setInterests((was === "patron" ? profile.supportInterests : profile.interests) ?? []);
    setOfferings(profile.partnerOfferings ?? []);
  }, [profile, onboarded, returning]);

  useEffect(() => {
    if (mustInvite && !left.current) navigate("/invite", { replace: true });
  }, [mustInvite, navigate]);

  const ready =
    isAuthenticated && !!profile && signupCommunity !== undefined && myCommunities !== undefined;
  const showing = ready && !mustInvite && returning !== null;

  const viewed = useRef(false);
  useEffect(() => {
    if (!showing || viewed.current) return;
    viewed.current = true;
    posthog?.capture("onboarding_viewed", { needs_name: needsName });
  }, [showing, needsName, posthog]);

  const toggle = (setList: (f: (prev: string[]) => string[]) => void) => (tag: string) =>
    setList((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  const toggleInterest = toggle(setInterests);
  const toggleOffering = toggle(setOfferings);

  function pickDoor(next: Role) {
    setRole(next);
    setError("");
    posthog?.capture("onboarding_door_picked", { door: next });
  }

  async function leave(exit: OnboardingExit) {
    if (!profile || busy) return;
    if (!hasNameIfNeeded(needsName, name)) {
      setError("Enter your name.");
      return;
    }
    if (exit === "shared" && !title.trim()) {
      setError("Give it a title.");
      return;
    }
    left.current = true;
    setError("");
    setBusy(exit);
    try {
      // A backer's picks are what they want to support, a partner's what
      // they offer; a maker's are their interests. Nothing picked leaves what
      // the profile has.
      const picked = interests.length > 0 ? interests : undefined;
      await upsertProfile({
        name: needsName ? name.trim() : profile.name,
        ...keepProfileFields(profile),
        ...(exit === "backer"
          ? { supportInterests: picked }
          : exit === "partner"
            ? {
                partnerOfferings: offerings.length > 0 ? offerings : undefined,
                orgName: placeName.trim() || undefined,
              }
            : { interests: picked }),
        primaryRole: roleForExit(exit),
      });
      if (exit === "shared") {
        const { projectId } = await createPassionProject({
          title: title.trim(),
          stage: stage ?? undefined,
          hostOrgId: gardenId,
        });
        posthog?.capture("onboarding_project_shared", {
          stage: stage ?? "planning",
          interests: interests.length,
          in_garden: !!gardenId,
        });
        dropShareProjectIntent();
        // Its page offers "Invite people" once (components/InviteToThis.tsx).
        navigate(justPublished(`/projects/${projectId}`), { replace: true });
        return;
      }
      posthog?.capture(
        exit === "backer" ? "onboarding_backer_exit" : exit === "partner" ? "onboarding_partner_exit" : "onboarding_not_yet",
        { interests: interests.length, offerings: offerings.length, title_typed: !!title.trim() },
      );
      dropShareProjectIntent();
      navigate(DESK_PATH, { replace: true });
    } catch (err) {
      console.error("Onboarding failed:", err);
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  if (!showing) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: INK }}>
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: CITRON, borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  return (
    <main className="min-h-screen flex justify-center px-5 py-10 sm:py-16" style={{ backgroundColor: INK, color: BODY }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (role === "creative") void leave("shared");
        }}
        className="w-full max-w-[40rem]"
      >
        <h1
          className="text-[28px] sm:text-[34px] font-semibold leading-tight"
          style={{ color: PAPER, fontFamily: "var(--garden-font-display)", textWrap: "balance" }}
        >
          What brings you here?
        </h1>

        {needsName && (
          <div className="mt-7">
            <label htmlFor="onboarding-name" className="block text-[13.5px] font-medium mb-1.5" style={{ color: PAPER }}>
              Your name
            </label>
            <input
              id="onboarding-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={FIELD}
              style={{ backgroundColor: RAISED, borderColor: LINE, color: PAPER }}
            />
            <PersonNameHint name={name} />
          </div>
        )}

        {/* The three doors. Picking one opens the rest of this same screen. */}
        <div role="radiogroup" aria-label="What brings you here?" className="mt-7 grid gap-2 sm:grid-cols-3">
          {DOORS.map((d) => {
            const on = role === d.role;
            return (
              <button
                key={d.role}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pickDoor(d.role)}
                className={`text-left rounded-xl border px-4 py-3.5 transition-colors ${FOCUS}`}
                style={{ backgroundColor: on ? CITRON : RAISED, borderColor: on ? CITRON : LINE }}
              >
                <span className="block text-[15px] font-semibold" style={{ color: on ? INK : PAPER }}>
                  {d.label}
                </span>
                <span className="block mt-0.5 text-[13.5px]" style={{ color: on ? INK : BODY }}>
                  {d.hint}
                </span>
              </button>
            );
          })}
        </div>

        {(role === "creative" || role === "patron") && (
          <>
            <h2 className="mt-9 text-[15px] font-medium" style={{ color: PAPER }}>
              {role === "creative" ? "What are you into?" : "What do you want to back?"}
            </h2>
            <div role="group" aria-label="Interests, optional" className="mt-3 flex flex-wrap gap-1.5">
              {INTERESTS.map((tag) => {
                const on = interests.includes(tag);
                const Icon = interestIcon(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleInterest(tag)}
                    className={`${PILL} inline-flex items-center gap-1.5`}
                    style={{
                      backgroundColor: on ? CITRON : RAISED,
                      borderColor: on ? CITRON : LINE,
                      color: on ? INK : BODY,
                    }}
                  >
                    <Icon size={16} weight="regular" aria-hidden />
                    {tag}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {role === "creative" && (
          <>
            <div className="mt-9">
              <label htmlFor="onboarding-title" className="block text-[15px] font-medium mb-1.5" style={{ color: PAPER }}>
                What are you working on?
              </label>
              <input
                id="onboarding-title"
                type="text"
                autoFocus={!needsName}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="A title is enough"
                className={FIELD}
                style={{ backgroundColor: RAISED, borderColor: LINE, color: PAPER }}
              />
              <p className="mt-1.5 text-[13.5px]" style={{ color: BODY }}>
                {VISIBILITY_NOTE}
              </p>
            </div>

            <div role="group" aria-label="Where it is" className="mt-5 flex flex-wrap gap-1.5">
              {START_STAGES.map((s) => {
                const on = stage === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setStage(on ? null : s.value)}
                    className={PILL}
                    style={{
                      backgroundColor: on ? CITRON : RAISED,
                      borderColor: on ? CITRON : LINE,
                      color: on ? INK : BODY,
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {role === "partner" && (
          <>
            <h2 className="mt-9 text-[15px] font-medium" style={{ color: PAPER }}>
              What can you offer?
            </h2>
            <div role="group" aria-label="What you can offer, optional" className="mt-3 flex flex-wrap gap-1.5">
              {PARTNER_OFFERINGS.map((offering) => {
                const on = offerings.includes(offering);
                return (
                  <button
                    key={offering}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleOffering(offering)}
                    className={PILL}
                    style={{
                      backgroundColor: on ? CITRON : RAISED,
                      borderColor: on ? CITRON : LINE,
                      color: on ? INK : BODY,
                    }}
                  >
                    {offering}
                  </button>
                );
              })}
            </div>
            <div className="mt-7">
              <label htmlFor="onboarding-place" className="block text-[15px] font-medium mb-1.5" style={{ color: PAPER }}>
                Your space or organization (optional)
              </label>
              <input
                id="onboarding-place"
                type="text"
                value={placeName}
                onChange={(e) => setPlaceName(e.target.value)}
                placeholder="Radius Coffee"
                className={FIELD}
                style={{ backgroundColor: RAISED, borderColor: LINE, color: PAPER }}
              />
              <p className="mt-1.5 text-[13.5px]" style={{ color: BODY }}>
                It gets its own page. You sign in as yourself.
              </p>
            </div>
          </>
        )}

        {error && (
          <p role="alert" className="mt-6 text-[14px]" style={{ color: ERROR }}>
            {error}
          </p>
        )}

        {role === "creative" && (
          <>
            <button
              type="submit"
              disabled={!title.trim() || busy !== null}
              className={`mt-8 w-full px-4 py-3 rounded-lg text-[15px] font-semibold disabled:opacity-50 ${FOCUS}`}
              style={{ backgroundColor: CITRON, color: INK }}
            >
              {busy === "shared" ? "Sharing…" : "Share it"}
            </button>
            <div className="mt-5">
              <button
                type="button"
                onClick={() => void leave("not_yet")}
                disabled={busy !== null}
                className={QUIET}
                style={{ color: PAPER }}
              >
                {returning ? "Save" : "Not yet"}
              </button>
            </div>
          </>
        )}

        {(role === "patron" || role === "partner") && (
          <button
            type="button"
            onClick={() => void leave(role === "patron" ? "backer" : "partner")}
            disabled={busy !== null}
            className={`mt-8 w-full px-4 py-3 rounded-lg text-[15px] font-semibold disabled:opacity-50 ${FOCUS}`}
            style={{ backgroundColor: CITRON, color: INK }}
          >
            {busy ? "Saving…" : returning ? "Save" : "Continue"}
          </button>
        )}
      </form>
    </main>
  );
}
