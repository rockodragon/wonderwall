// /give — each paid month, a member picks who gets their monthly grant.
//
// The page has four jobs, top to bottom: choose (a creative, a project or
// the grant fund), then the optional one-time "give more" ask, then past months,
// then "Given to you" for anyone who has been given something (creatives who
// only receive land here too, so it renders with no amount of their own).
//
// Spine: _bmad-output/planning-artifacts/ux-designs/ux-wonderwall-2026-09-30-giving/.
// Money sentences come from CLAIMS; amounts come from the member's own
// invoice via formatMoney(cents) and are never typed here.
//
// Hooks stay above every return; a Rules-of-Hooks violation crashed a page
// before. Every field the backend adds is read with optional chaining so the
// deploy window between frontend and backend cannot crash the page.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Link, useSearchParams } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { buildFundPlusUpLink } from "../../convex/garden/givingLink";
import { CLAIMS } from "../constants/claims";
import { useAnalytics } from "../hooks/useAnalytics";
import { GardenPage, formatDate, formatMoney, formatPeriod } from "../garden/ui";
import "../garden/garden.css";

export function meta() {
  return [{ title: "Give — The Garden" }, { name: "robots", content: "noindex" }];
}

type Target = "creative" | "project" | "fund";

type Done = {
  giftId: Id<"memberGifts">;
  amountCents: number;
  target: Target;
  visible: boolean;
  recipientUserId?: Id<"users">;
  recipientName?: string;
  projectId?: Id<"projects">;
  projectTitle?: string;
  /** The member already added their own money at the first Give; skip the follow-on ask. */
  plussedUp?: boolean;
  /** The combined checkout failed to start after the decision landed. */
  checkoutError?: string;
};

const PLUS_UP_AMOUNTS_CENTS = [1000, 2500, 5000] as const;
const MIN_PLUS_UP_CENTS = 500;
const ROWS_SHOWN = 15;
const NOTE_MAX = 200;
const FUND_SLUG = "abiding-practice";

const PAPER = "var(--g-paper)";
const BODY = "var(--g-body)";
const CITRON = "var(--g-citron)";
const HAIR = "var(--g-hairline)";

function reasonFrom(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as unknown;
    if (typeof data === "string") return data;
    if (data && typeof data === "object" && "reason" in data) {
      const reason = (data as { reason?: unknown }).reason;
      if (reason) return String(reason);
    }
  }
  return fallback;
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** The small "i" next to a heading. Hover on desktop, tap toggles; Escape or an outside click closes. */
function InfoTip({ lines }: { lines: string[] }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  const shown = open || pinned;

  useEffect(() => {
    if (!shown) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setPinned(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setPinned(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [shown]);

  return (
    <span
      ref={ref}
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="How this works"
        aria-expanded={shown}
        aria-controls={id}
        onClick={() => setPinned((p) => !p)}
        style={{
          width: 28,
          height: 28,
          borderRadius: 9999,
          border: `1px solid ${HAIR}`,
          background: "transparent",
          color: PAPER,
          fontFamily: "var(--g-mono, monospace)",
          fontSize: 14,
          fontStyle: "italic",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        i
      </button>
      {shown && (
        <span
          id={id}
          role="note"
          style={{
            position: "absolute",
            top: 34,
            left: 0,
            zIndex: 20,
            width: "min(320px, 80vw)",
            padding: "12px 14px",
            borderRadius: 10,
            border: `1px solid ${HAIR}`,
            background: "var(--garden-raised, #232321)",
            color: BODY,
            fontSize: 14.5,
            lineHeight: 1.5,
            fontWeight: 400,
            letterSpacing: "normal",
            display: "grid",
            gap: 6,
          }}
        >
          {lines.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </span>
      )}
    </span>
  );
}

const GIVING_TIP_LINES = [
  "Your monthly grant is half of your membership, after card processing.",
  CLAIMS.memberDirectedFull,
  "They see your name unless you give anonymously.",
];

// ————— Page —————

export default function Give() {
  const giving = useQuery(api.garden.giving.getMyGiving);
  const profile = useQuery(api.profiles.getMyProfile);
  const [searchParams] = useSearchParams();
  const { capture } = useAnalytics();
  const [done, setDone] = useState<Done | null>(null);
  const tracked = useRef(false);

  const open = giving?.open ?? [];
  const history = giving?.history ?? [];
  const received = giving?.received ?? [];
  const owedCents = giving?.owedCents ?? 0;
  const hasOpen = open.length > 0;

  useEffect(() => {
    if (hasOpen && !tracked.current) {
      tracked.current = true;
      capture("giving_notice_opened");
    }
  }, [hasOpen, capture]);

  if (giving === undefined || giving === null) return null;

  const backed = searchParams.get("backed") === "1" || searchParams.get("added") === "1";
  const lastDefault = history[0]?.decidedBy === "default" ? history[0] : undefined;
  const nothingAtAll = !hasOpen && !done && history.length === 0;

  return (
    <GardenPage bare>
      <div style={{ marginTop: 28 }}>
        {backed && (
          <p style={{ color: CITRON, fontSize: 15, marginBottom: 20 }} role="status">
            Added. Thank you.
          </p>
        )}

        {lastDefault && !done && (
          <p className="g-hint-body" style={{ marginBottom: 20, fontSize: 15, color: BODY }}>
            Last month's {formatMoney(lastDefault.amountCents)} went to the grant fund.
          </p>
        )}

        {done && (
          <DoneBlock
            done={done}
            userId={profile?.userId}
            email={profile?.email ?? undefined}
            capture={capture}
          />
        )}

        {open.map((gift, i) => (
          <Chooser
            key={gift.giftId}
            gift={gift}
            first={i === 0 && !done}
            onDecided={(d) => setDone(d)}
            capture={capture}
          />
        ))}

        {nothingAtAll && (
          <div>
            <p style={{ fontSize: 17, color: BODY, maxWidth: "52ch" }}>
              Members get a monthly grant to give away.
            </p>
            <div style={{ marginTop: 16 }}>
              <Link to="/join" className="g-btn g-btn-citron">
                Become a member
              </Link>
            </div>
          </div>
        )}

        {!hasOpen && !done && history.length > 0 && (
          <div>
            <p style={{ fontSize: 17, color: BODY, maxWidth: "52ch" }}>
              Nothing to give right now. Your next amount opens when your membership is billed.
            </p>
          </div>
        )}

        <HistorySection history={history} />
        <ReceivedSection
          received={received}
          owedCents={owedCents}
          payoutsEnabled={Boolean(giving?.connect?.payoutsEnabled)}
        />
      </div>
    </GardenPage>
  );
}

type GivingData = NonNullable<ReturnType<typeof useGiving>>;
function useGiving() {
  return useQuery(api.garden.giving.getMyGiving);
}
type Gift = GivingData["open"][number];

// ————— Choose —————

function Chooser({
  gift,
  first,
  onDecided,
  capture,
}: {
  gift: Gift;
  first: boolean;
  onDecided: (d: Done) => void;
  capture: (event: string, props?: Record<string, unknown>) => void;
}) {
  const decide = useMutation(api.garden.giving.decideGift);
  const giftCheckout = useAction(api.garden.stripe.createGiftCheckout);
  const backingCheckout = useAction(api.garden.stripe.createBackingCheckout);
  const amount = formatMoney(gift.amountCents);

  const [target, setTarget] = useState<Target | null>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [creative, setCreative] = useState<{ userId: Id<"users">; name: string } | null>(null);
  const [project, setProject] = useState<{ projectId: Id<"projects">; title: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [note, setNote] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extraChoice, setExtraChoice] = useState<number | "custom" | null>(null);
  const [extraCustom, setExtraCustom] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const people = useQuery(
    api.garden.giving.searchRecipients,
    target === "creative" ? { giftId: gift.giftId, query: debounced || undefined } : "skip",
  );
  const projects = useQuery(
    api.garden.giving.listProjectsForGift,
    target === "project" ? { giftId: gift.giftId } : "skip",
  );

  const choices: { id: Target; title: string; text?: string }[] = [
    { id: "creative", title: "A creative" },
    { id: "project", title: "A project" },
    { id: "fund", title: "The grant fund", text: `Pick by ${formatDate(gift.defaultAt)}. If you don't, it goes here.` },
  ];

  function pickTarget(next: Target) {
    setTarget(next);
    setSearch("");
    setError(null);
  }

  function onChoiceKey(e: React.KeyboardEvent, index: number) {
    const fwd = e.key === "ArrowDown" || e.key === "ArrowRight";
    const back = e.key === "ArrowUp" || e.key === "ArrowLeft";
    if (!fwd && !back) return;
    e.preventDefault();
    const next = choices[(index + (fwd ? 1 : choices.length - 1)) % choices.length];
    pickTarget(next.id);
    const group = (e.currentTarget as HTMLElement).parentElement;
    const el = group?.querySelectorAll<HTMLElement>('[role="radio"]')[choices.indexOf(next)];
    el?.focus();
  }

  const ready =
    target === "fund" ||
    (target === "creative" && creative !== null) ||
    (target === "project" && project !== null);

  const extraAllowed = (target === "creative" && creative !== null) || (target === "project" && project !== null);
  const extraRaw =
    extraChoice === "custom" ? Math.round(parseFloat(extraCustom || "0") * 100) : extraChoice;
  const extraValid = extraRaw !== null && Number.isFinite(extraRaw) && extraRaw >= MIN_PLUS_UP_CENTS;
  // A chip is picked but its amount is not usable yet (an empty or too-small custom amount).
  const extraBlocked = extraAllowed && extraChoice !== null && !extraValid;
  const extraCents = extraAllowed && extraValid ? (extraRaw as number) : 0;
  const plus = extraCents > 0 ? ` + ${formatMoney(extraCents)}` : "";

  let label = `Give ${amount} to a creative`;
  if (target === "creative" && creative) label = `Give ${amount}${plus} to ${creative.name.split(" ")[0]}`;
  if (target === "project") label = project ? `Give ${amount}${plus} to ${project.title}` : `Give ${amount} to a project`;
  if (target === "fund") label = "Leave it in the grant fund";
  const busyLabel = target === "fund" ? "Saving…" : "Giving…";

  async function confirm() {
    if (!target || !ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const visible = !anonymous;
      const trimmed = note.trim() || undefined;
      const plussedUp = extraCents > 0;
      let done: Done;
      if (target === "creative" && creative) {
        await decide({ giftId: gift.giftId, target, recipientUserId: creative.userId, note: trimmed, visible });
        done = {
          giftId: gift.giftId,
          amountCents: gift.amountCents,
          target,
          visible,
          recipientUserId: creative.userId,
          recipientName: creative.name,
          plussedUp,
        };
      } else if (target === "project" && project) {
        await decide({ giftId: gift.giftId, target, projectId: project.projectId, note: trimmed, visible });
        done = {
          giftId: gift.giftId,
          amountCents: gift.amountCents,
          target,
          visible,
          projectId: project.projectId,
          projectTitle: project.title,
          plussedUp,
        };
      } else {
        await decide({ giftId: gift.giftId, target: "fund" });
        done = { giftId: gift.giftId, amountCents: gift.amountCents, target: "fund", visible: true };
      }
      onDecided(done);
      capture("giving_decided", { target });
      if (plussedUp) {
        // The decision has landed. A checkout failure shows in the done state and never undoes it.
        capture("giving_plus_up_started", { target, combined: true });
        try {
          let url: string;
          if (done.target === "creative" && done.recipientUserId) {
            ({ url } = await giftCheckout({
              recipientUserId: done.recipientUserId,
              amountCents: extraCents,
              recurring: false,
              visible: !anonymous,
              memberGiftId: gift.giftId,
            }));
          } else if (done.target === "project" && done.projectId) {
            ({ url } = await backingCheckout({
              projectId: done.projectId,
              amountCents: extraCents,
              recurring: false,
              visible: !anonymous,
              from: "project",
              memberGiftId: gift.giftId,
            }));
          } else {
            throw new Error("no target");
          }
          window.location.assign(url);
        } catch (err) {
          onDecided({ ...done, checkoutError: reasonFrom(err, "Couldn't start checkout. Try again.") });
        }
      }
    } catch (err) {
      setError(reasonFrom(err, "Couldn't save that. Try again."));
      setBusy(false);
    }
  }

  const followingOf = (p: unknown): boolean => (p as { following?: boolean })?.following ?? false;
  const ownerFollowedOf = (p: unknown): boolean => (p as { ownerFollowed?: boolean })?.ownerFollowed ?? false;
  const peopleRows = people ?? [];
  const anyFollowing = peopleRows.some(followingOf);
  const groupHeads = debounced === "" && anyFollowing;
  const shownPeople = showAll ? peopleRows : peopleRows.slice(0, ROWS_SHOWN);
  const q = search.trim().toLowerCase();
  const projectRows = (projects ?? [])
    .filter((p) => !q || `${p.title} ${p.ownerName}`.toLowerCase().includes(q))
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(ownerFollowedOf(b.p)) - Number(ownerFollowedOf(a.p)) || a.i - b.i)
    .map((x) => x.p);
  const shownProjects = showAll ? projectRows : projectRows.slice(0, ROWS_SHOWN);
  const pickedProjectId = project?.projectId;
  const showNote = target === "creative" || target === "project";

  return (
    <section style={{ marginTop: first ? 0 : 48 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {first ? (
          <h1 className="g-h" style={{ fontSize: "clamp(28px,5vw,40px)" }}>
            You have {amount} to give.
          </h1>
        ) : (
          <h2 className="g-h" style={{ fontSize: 28 }}>
            You have {amount} to give.
          </h2>
        )}
        <InfoTip lines={GIVING_TIP_LINES} />
      </div>
      <p style={{ marginTop: 12, fontSize: 17, color: BODY }}>Support a creative, a project, or the grant fund.</p>

      <div role="radiogroup" aria-label={`Who gets your ${amount}`} style={{ marginTop: 24 }}>
        <div style={{ display: "grid", gap: 12 }}>
          {choices.map((c, i) => {
            const on = target === c.id;
            return (
              <div
                key={c.id}
                role="radio"
                aria-checked={on}
                tabIndex={on || (target === null && i === 0) ? 0 : -1}
                onClick={() => pickTarget(c.id)}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    pickTarget(c.id);
                  } else onChoiceKey(e, i);
                }}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                  border: `1px solid ${on ? CITRON : HAIR}`,
                  borderRadius: 10,
                  padding: "16px 18px",
                  minHeight: 44,
                  cursor: "pointer",
                }}
              >
                <div>
                  <b style={{ display: "block", color: PAPER, fontSize: 17, fontWeight: 600, lineHeight: 1.3 }}>
                    {c.title}
                  </b>
                  {c.text && (
                    <span style={{ display: "block", fontSize: 14.5, color: BODY, marginTop: 3, lineHeight: 1.5 }}>
                      {c.text}
                    </span>
                  )}
                </div>
                {on && (
                  <span aria-hidden="true" style={{ color: CITRON, fontFamily: "var(--g-mono, monospace)", fontSize: 15 }}>
                    ✓
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {target === "creative" && (
        <div style={{ marginTop: 20 }}>
          {creative ? (
            <>
              <span className="g-label">Your pick</span>
              <div style={{ marginTop: 10 }}>
                <PickerRow
                  avatar={initials(creative.name)}
                  title={creative.name}
                  meta={null}
                  selected
                  onSelect={() => {}}
                />
              </div>
              <button
                type="button"
                className="g-btn g-btn-ghost"
                style={{ marginTop: 10 }}
                onClick={() => setCreative(null)}
              >
                Change
              </button>
            </>
          ) : (
            <>
              <input
                id={`search-${gift.giftId}`}
                className="g-input"
                aria-label="Search creatives"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or keyword"
                autoComplete="off"
              />
              <p className="g-hint" style={{ marginTop: 6 }} aria-live="polite">
                {people !== undefined && peopleRows.length === 0 ? `No one found in ${gift.communityName}.` : ""}
              </p>
              <div
                role="radiogroup"
                aria-label="Pick a creative"
                style={{ marginTop: 6, borderTop: `1px solid ${HAIR}` }}
              >
                {shownPeople.map((p, i) => {
                  const rowFollowing = followingOf(p);
                  const startsFollowing = groupHeads && rowFollowing && i === 0;
                  const startsEveryone = groupHeads && !rowFollowing && (i === 0 || followingOf(shownPeople[i - 1]));
                  return (
                    <div key={p.userId}>
                      {startsFollowing && <GroupHead>People you follow</GroupHead>}
                      {startsEveryone && anyFollowing && <GroupHead>Everyone</GroupHead>}
                      <PickerRow
                        avatar={initials(p.name)}
                        title={p.name}
                        meta={[p.interests?.[0], p.location].filter(Boolean).join(" · ") || null}
                        selected={false}
                        onSelect={() => setCreative({ userId: p.userId, name: p.name })}
                      />
                    </div>
                  );
                })}
              </div>
              {!showAll && peopleRows.length > ROWS_SHOWN && (
                <button type="button" className="g-btn g-btn-ghost" style={{ marginTop: 12 }} onClick={() => setShowAll(true)}>
                  Show more
                </button>
              )}
            </>
          )}
        </div>
      )}

      {target === "project" && (
        <div style={{ marginTop: 20 }}>
          {project ? (
            <>
              <span className="g-label">Your pick</span>
              <div style={{ marginTop: 10 }}>
                <PickerRow title={project.title} meta={null} selected onSelect={() => {}} />
              </div>
              <button type="button" className="g-btn g-btn-ghost" style={{ marginTop: 10 }} onClick={() => setProject(null)}>
                Change
              </button>
            </>
          ) : (
            <>
              <input
                className="g-input"
                aria-label="Search projects"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects"
                autoComplete="off"
              />
              <p className="g-hint" style={{ marginTop: 6 }} aria-live="polite">
                {projects !== undefined && projectRows.length === 0
                  ? projects.length === 0
                    ? `No open projects in ${gift.communityName} right now.`
                    : "No projects found."
                  : ""}
              </p>
              <div role="radiogroup" aria-label="Pick a project" style={{ marginTop: 6, borderTop: `1px solid ${HAIR}` }}>
                {shownProjects.map((p) => (
                  <PickerRow
                    key={p.projectId}
                    title={p.title}
                    meta={`${p.ownerName} · ${formatMoney(p.raisedCents)} raised`}
                    selected={pickedProjectId === p.projectId}
                    onSelect={() => setProject({ projectId: p.projectId, title: p.title })}
                  />
                ))}
              </div>
              {!showAll && projectRows.length > ROWS_SHOWN && (
                <button type="button" className="g-btn g-btn-ghost" style={{ marginTop: 12 }} onClick={() => setShowAll(true)}>
                  Show more
                </button>
              )}
            </>
          )}
        </div>
      )}

      {showNote && (
        <div style={{ marginTop: 24 }}>
          <textarea
            id={`note-${gift.giftId}`}
            aria-label="Add a note"
            className="g-input"
            style={{ minHeight: 84, resize: "vertical" }}
            rows={3}
            maxLength={NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note"
          />
          <div
            style={{
              textAlign: "right",
              marginTop: 5,
              fontSize: 14.5,
              color: note.length >= 180 ? PAPER : "var(--g-dim)",
            }}
            aria-live="polite"
          >
            {note.length}/{NOTE_MAX}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, fontSize: 15, color: BODY, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: "#fee268" }}
            />
            Give anonymously
          </label>
        </div>
      )}

      {extraAllowed && (
        <div style={{ marginTop: 24 }}>
          <p style={{ fontSize: 15, color: BODY }}>Add more of your own?</p>
          <div role="radiogroup" aria-label="Add more of your own" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {[...PLUS_UP_AMOUNTS_CENTS, "custom" as const].map((c) => {
              const on = extraChoice === c;
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className="g-btn g-btn-ghost"
                  onClick={() => setExtraChoice(on ? null : c)}
                  style={{ minWidth: 72, minHeight: 44, ...(on ? { borderColor: CITRON, color: CITRON } : null) }}
                >
                  {c === "custom" ? "Custom" : formatMoney(c)}
                </button>
              );
            })}
          </div>
          {extraChoice === "custom" && (
            <input
              className="g-input"
              value={extraCustom}
              onChange={(e) => setExtraCustom(e.target.value)}
              inputMode="decimal"
              placeholder="Dollars"
              aria-label="Amount in dollars"
              style={{ marginTop: 10, maxWidth: 160 }}
            />
          )}
          {extraBlocked && (
            <p className="g-hint" style={{ marginTop: 6 }} aria-live="polite">
              Give at least {formatMoney(MIN_PLUS_UP_CENTS)}, or clear it.
            </p>
          )}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <button
          type="button"
          className="g-btn g-btn-citron"
          onClick={confirm}
          disabled={!ready || busy || extraBlocked}
          aria-label={ready ? label : undefined}
          style={{ opacity: !ready || busy || extraBlocked ? 0.5 : 1, maxWidth: "100%" }}
        >
          {busy ? busyLabel : label}
        </button>
        {error && (
          <p style={{ marginTop: 10, fontSize: 14.5, color: BODY }} role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

function GroupHead({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: "12px 10px 4px", fontSize: 14, color: "var(--g-muted)", fontWeight: 600 }}>{children}</div>
  );
}

function PickerRow({
  avatar,
  title,
  meta,
  selected,
  onSelect,
}: {
  avatar?: string;
  title: string;
  meta: string | null;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        textAlign: "left",
        padding: "12px 10px",
        minHeight: 44,
        background: "transparent",
        cursor: "pointer",
        border: selected ? `1px solid ${CITRON}` : "none",
        borderBottom: selected ? `1px solid ${CITRON}` : `1px solid ${HAIR}`,
        borderRadius: selected ? 3 : 0,
      }}
    >
      {avatar !== undefined && (
        <span
          aria-hidden="true"
          style={{
            width: 36,
            height: 36,
            borderRadius: 9999,
            background: "var(--garden-hairline-raised, #3a3a36)",
            color: PAPER,
            fontFamily: "var(--g-mono, monospace)",
            fontSize: 13.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {avatar}
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <b style={{ display: "block", color: PAPER, fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>{title}</b>
        {meta && <span style={{ display: "block", fontSize: 14.5, color: "var(--g-dim)", lineHeight: 1.4 }}>{meta}</span>}
      </span>
      {selected && (
        <span aria-hidden="true" style={{ color: CITRON, fontSize: 15 }}>
          ✓
        </span>
      )}
    </button>
  );
}

// ————— Done + plus-up —————

function DoneBlock({
  done,
  userId,
  email,
  capture,
}: {
  done: Done;
  userId?: string;
  email?: string;
  capture: (event: string, props?: Record<string, unknown>) => void;
}) {
  const amount = formatMoney(done.amountCents);
  const [skipped, setSkipped] = useState(false);

  let heading = "";
  if (done.target === "creative") heading = `You gave ${amount} to ${done.recipientName ?? "them"}.`;
  else if (done.target === "project") heading = `You gave ${amount} to ${done.projectTitle ?? "the project"}.`;
  else heading = `Your ${amount} went to the grant fund.`;

  const askName =
    done.target === "creative"
      ? done.recipientName ?? "them"
      : done.target === "project"
        ? (done.projectTitle ?? "the project")
        : "the Sophia Fund";
  const tipLines =
    done.target === "fund" ? GIVING_TIP_LINES : [...GIVING_TIP_LINES, "90% goes to them. Card processing is added at checkout."];

  return (
    <section style={{ borderLeft: `2px solid ${CITRON}`, paddingLeft: 16, marginBottom: 48 }} aria-live="polite">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 className="g-h" style={{ fontSize: 22, lineHeight: 1.15 }}>
          {heading}
        </h2>
        <InfoTip lines={tipLines} />
      </div>

      {done.checkoutError && (
        <p style={{ marginTop: 12, fontSize: 14.5, color: BODY }} role="alert">
          {done.checkoutError}
        </p>
      )}

      {!skipped && !done.plussedUp && (
        <div style={{ marginTop: 28 }}>
          <h3 className="g-h" style={{ fontSize: 22, lineHeight: 1.15 }}>
            Give more to {askName}?
          </h3>
          {done.target === "fund" ? (
            <FundPlusUp done={done} userId={userId} email={email} capture={capture} />
          ) : (
            <PlusUpForm done={done} capture={capture} />
          )}
          <button type="button" className="g-btn g-btn-ghost" style={{ marginTop: 16 }} onClick={() => setSkipped(true)}>
            Skip
          </button>
        </div>
      )}
    </section>
  );
}

function PlusUpForm({
  done,
  capture,
}: {
  done: Done;
  capture: (event: string, props?: Record<string, unknown>) => void;
}) {
  const giftCheckout = useAction(api.garden.stripe.createGiftCheckout);
  const backingCheckout = useAction(api.garden.stripe.createBackingCheckout);
  const [choice, setChoice] = useState<number | "custom">(PLUS_UP_AMOUNTS_CENTS[1]);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cents = choice === "custom" ? Math.round(parseFloat(custom || "0") * 100) : choice;
  const valid = Number.isFinite(cents) && cents >= MIN_PLUS_UP_CENTS;
  const label = valid ? `One-time gift of ${formatMoney(cents)}` : "One-time gift";

  async function go() {
    if (busy) return;
    if (!valid) {
      setError(`Give at least ${formatMoney(MIN_PLUS_UP_CENTS)}.`);
      return;
    }
    setError(null);
    setBusy(true);
    capture("giving_plus_up_started", { target: done.target, recurring: false });
    try {
      let url: string;
      if (done.target === "creative" && done.recipientUserId) {
        ({ url } = await giftCheckout({
          recipientUserId: done.recipientUserId,
          amountCents: cents,
          recurring: false,
          visible: done.visible,
          memberGiftId: done.giftId,
        }));
      } else if (done.target === "project" && done.projectId) {
        ({ url } = await backingCheckout({
          projectId: done.projectId,
          amountCents: cents,
          recurring: false,
          visible: done.visible,
          from: "project",
          memberGiftId: done.giftId,
        }));
      } else {
        throw new Error("no target");
      }
      // Leaving for Stripe: the button stays disabled through the handoff.
      window.location.assign(url);
    } catch (err) {
      setError(reasonFrom(err, "Couldn't start checkout. Try again."));
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div role="radiogroup" aria-label="How much" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        {[...PLUS_UP_AMOUNTS_CENTS, "custom" as const].map((c) => {
          const on = choice === c;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={on}
              className="g-btn g-btn-ghost"
              onClick={() => setChoice(c)}
              style={{ minWidth: 72, minHeight: 44, ...(on ? { borderColor: CITRON, color: CITRON } : null) }}
            >
              {c === "custom" ? "Custom" : formatMoney(c)}
            </button>
          );
        })}
      </div>
      {choice === "custom" && (
        <input
          className="g-input"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          inputMode="decimal"
          placeholder="Dollars"
          aria-label="Amount in dollars"
          style={{ marginTop: 10, maxWidth: 160 }}
        />
      )}

      <div style={{ marginTop: 16 }}>
        <button type="button" className="g-btn g-btn-citron" onClick={go} disabled={busy} style={{ opacity: busy ? 0.5 : 1 }}>
          {busy ? "Starting checkout…" : label}
        </button>
      </div>
      {error && (
        <p style={{ marginTop: 10, fontSize: 14.5, color: BODY }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function FundPlusUp({
  done,
  userId,
  email,
  capture,
}: {
  done: Done;
  userId?: string;
  email?: string;
  capture: (event: string, props?: Record<string, unknown>) => void;
}) {
  const fundPage = useQuery(api.garden.allocations.getFundPage, { hostOrgSlug: FUND_SLUG });
  const once = fundPage?.org?.paymentLinkUrl;

  const links = useMemo(() => {
    if (!userId) return { once: undefined };
    const ref = { memberGiftId: String(done.giftId), userId: String(userId) };
    const opts = { email };
    const build = (u?: string) => {
      if (!u) return undefined;
      try {
        return buildFundPlusUpLink(u, ref, opts);
      } catch {
        return undefined;
      }
    };
    return { once: build(once) };
  }, [done.giftId, userId, email, once]);

  if (!links.once) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {links.once && (
          <a
            href={links.once}
            className="g-btn g-btn-citron"
            onClick={() => capture("giving_plus_up_started", { target: "fund", recurring: false })}
          >
            One-time gift to the Sophia Fund
          </a>
        )}
      </div>
      <p className="g-hint-body" style={{ marginTop: 12, fontSize: 14.5, color: BODY }}>
        {CLAIMS.grantFundDeductible}
      </p>
    </div>
  );
}

// ————— History —————

function HistorySection({ history }: { history: Gift[] }) {
  if (history.length === 0) return null;
  return (
    <section style={{ marginTop: 48 }}>
      <span className="g-label">Past months</span>
      <div style={{ marginTop: 12, borderTop: `1px solid ${HAIR}` }}>
        {history.map((g) => {
          const amount = formatMoney(g.amountCents);
          let did = "";
          if (g.status === "creative") did = `Gave ${amount} to ${g.recipient?.name ?? "someone"}`;
          else if (g.status === "project") did = `Gave ${amount} to ${g.project?.title ?? "a project"}`;
          else did = g.decidedBy === "default" ? "Went to the grant fund" : "Grant fund";
          const plusUp = g.plusUpCents ?? 0;
          return (
            <HistoryRow
              key={g.giftId}
              period={formatPeriod(g.period)}
              did={did}
              added={plusUp > 0 ? `Plussed up ${formatMoney(plusUp)}` : undefined}
            />
          );
        })}
      </div>
    </section>
  );
}

const ROW: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "baseline",
  gap: 12,
  padding: "14px 0",
  borderBottom: `1px solid ${HAIR}`,
};

function HistoryRow({ period, did, added }: { period: string; did: string; added?: string }) {
  return (
    <div style={ROW}>
      <span
        style={{
          fontFamily: "var(--g-mono, monospace)",
          fontSize: 12.5,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--g-dim)",
          minWidth: 72,
        }}
      >
        {period}
      </span>
      <span style={{ color: PAPER, fontSize: 15 }}>{did}</span>
      {added && <span style={{ color: "var(--g-muted)", fontSize: 14.5 }}>· {added}</span>}
    </div>
  );
}

// ————— Given to you —————

function ReceivedSection({
  received,
  owedCents,
  payoutsEnabled,
}: {
  received: GivingData["received"];
  owedCents: number;
  payoutsEnabled: boolean;
}) {
  if (received.length === 0 && owedCents <= 0) return null;
  return (
    <section style={{ marginTop: 48 }}>
      <span className="g-label">Given to you</span>
      {owedCents > 0 && (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              fontFamily: "var(--g-font-display, inherit)",
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: PAPER,
            }}
          >
            {formatMoney(owedCents)} owed to you
          </div>
          {!payoutsEnabled && (
            <>
              <p className="g-hint-body" style={{ marginTop: 6, fontSize: 14.5, color: BODY }}>
                Connect your bank in Settings to get it.
              </p>
              <Link to="/settings?tab=money" className="g-btn g-btn-ghost" style={{ marginTop: 12 }}>
                Get paid in Settings
              </Link>
            </>
          )}
        </div>
      )}
      <div style={{ marginTop: 12, borderTop: `1px solid ${HAIR}` }}>
        {received.map((r) => {
          const amount = formatMoney(r.amountCents);
          const did = `${r.giverName} gave you ${amount}`;
          return (
            <HistoryRow
              key={r.id}
              period={formatPeriod(r.period)}
              did={did}
            />
          );
        })}
      </div>
    </section>
  );
}
