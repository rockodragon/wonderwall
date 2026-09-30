// /give — each paid month, a member picks who gets their half.
//
// The page has four jobs, top to bottom: choose (a creative, a project or
// the grant fund), then the optional "add your own" ask, then past months,
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

import { useEffect, useMemo, useRef, useState } from "react";
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
  return [{ title: "Your half — The Garden" }, { name: "robots", content: "noindex" }];
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

/** The second sentence of CLAIMS.pool, used under "stays in the grant fund". */
const POOL_SECOND_SENTENCE = CLAIMS.pool.replace(CLAIMS.duesEvery, "").trim();

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
            Last month's {formatMoney(lastDefault.amountCents)} stayed in the grant fund. You didn't pick by{" "}
            {formatDate(lastDefault.defaultAt)}.
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
            <span className="g-label">Your half</span>
            <p style={{ marginTop: 10, fontSize: 17, color: BODY, maxWidth: "52ch" }}>
              Members get half of their dues to give each month.
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
            <span className="g-label">Your half</span>
            <p style={{ marginTop: 10, fontSize: 17, color: BODY, maxWidth: "52ch" }}>
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

  const choices: { id: Target; title: string; text: string }[] = [
    {
      id: "creative",
      title: "A creative",
      text: `Anyone in ${gift.communityName} except you. ${CLAIMS.memberDirectedFull}`,
    },
    {
      id: "project",
      title: "A project",
      text: `An open project in ${gift.communityName}. It shows on the project as a backing.`,
    },
    { id: "fund", title: "The grant fund", text: CLAIMS.pool },
  ];

  function pickTarget(next: Target) {
    setTarget(next);
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

  let label = `Give ${amount} to a creative`;
  if (target === "creative" && creative) label = `Give ${amount} to ${creative.name.split(" ")[0]}`;
  if (target === "project") label = project ? `Give ${amount} to ${project.title}` : `Give ${amount} to a project`;
  if (target === "fund") label = "Leave it in the grant fund";
  const busyLabel = target === "fund" ? "Saving…" : "Giving…";

  async function confirm() {
    if (!target || !ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const visible = !anonymous;
      const trimmed = note.trim() || undefined;
      if (target === "creative" && creative) {
        await decide({ giftId: gift.giftId, target, recipientUserId: creative.userId, note: trimmed, visible });
        onDecided({
          giftId: gift.giftId,
          amountCents: gift.amountCents,
          target,
          visible,
          recipientUserId: creative.userId,
          recipientName: creative.name,
        });
      } else if (target === "project" && project) {
        await decide({ giftId: gift.giftId, target, projectId: project.projectId, note: trimmed, visible });
        onDecided({
          giftId: gift.giftId,
          amountCents: gift.amountCents,
          target,
          visible,
          projectId: project.projectId,
          projectTitle: project.title,
        });
      } else {
        await decide({ giftId: gift.giftId, target: "fund" });
        onDecided({ giftId: gift.giftId, amountCents: gift.amountCents, target: "fund", visible: true });
      }
      capture("giving_decided", { target });
    } catch (err) {
      setError(reasonFrom(err, "Couldn't save that. Try again."));
      setBusy(false);
    }
  }

  const peopleRows = people ?? [];
  const shownPeople = showAll ? peopleRows : peopleRows.slice(0, ROWS_SHOWN);
  const projectRows = projects ?? [];
  const shownProjects = showAll ? projectRows : projectRows.slice(0, ROWS_SHOWN);
  const showNote = target === "creative" || target === "project";

  return (
    <section style={{ marginTop: first ? 0 : 48 }}>
      <span className="g-label">Your half</span>
      {first ? (
        <h1 className="g-h" style={{ marginTop: 8, fontSize: "clamp(28px,5vw,40px)" }}>
          You have {amount} to give this month.
        </h1>
      ) : (
        <h2 className="g-h" style={{ marginTop: 8, fontSize: 28 }}>
          You have {amount} to give this month.
        </h2>
      )}
      <p style={{ marginTop: 12, fontSize: 17, color: BODY }}>{CLAIMS.memberDirectedDefault}</p>
      <p className="g-hint" style={{ marginTop: 4 }}>
        Pick by {formatDate(gift.defaultAt)}.
      </p>
      <p className="g-hint-body" style={{ marginTop: 12, fontSize: 14.5, color: BODY }}>
        {CLAIMS.dues} {CLAIMS.memberDirected}
      </p>

      <div role="radiogroup" aria-label={`Where your ${amount} goes`} style={{ marginTop: 36 }}>
        <span className="g-label">Where it goes</span>
        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
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
                  <span style={{ display: "block", fontSize: 14.5, color: BODY, marginTop: 3, lineHeight: 1.5 }}>
                    {c.text}
                  </span>
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
              <label className="g-label" htmlFor={`search-${gift.giftId}`}>
                Pick a creative
              </label>
              <input
                id={`search-${gift.giftId}`}
                className="g-input"
                style={{ marginTop: 10 }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name"
                autoComplete="off"
              />
              <p className="g-hint" style={{ marginTop: 6 }} aria-live="polite">
                {people === undefined
                  ? ""
                  : peopleRows.length === 0
                    ? `No one by that name in ${gift.communityName}.`
                    : `${peopleRows.length} ${peopleRows.length === 1 ? "person" : "people"}`}
              </p>
              <div
                role="radiogroup"
                aria-label="Pick a creative"
                style={{ marginTop: 12, borderTop: `1px solid ${HAIR}` }}
              >
                {shownPeople.map((p) => (
                  <PickerRow
                    key={p.userId}
                    avatar={initials(p.name)}
                    title={p.name}
                    meta={[p.interests?.[0], p.location].filter(Boolean).join(" · ") || null}
                    selected={false}
                    onSelect={() => setCreative({ userId: p.userId, name: p.name })}
                  />
                ))}
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
              <span className="g-label">Pick a project</span>
              <p className="g-hint" style={{ marginTop: 6 }} aria-live="polite">
                {projects === undefined
                  ? ""
                  : projectRows.length === 0
                    ? `No open projects in ${gift.communityName} right now.`
                    : `${projectRows.length} open ${projectRows.length === 1 ? "project" : "projects"}. Yours aren't listed.`}
              </p>
              <div role="radiogroup" aria-label="Pick a project" style={{ marginTop: 12, borderTop: `1px solid ${HAIR}` }}>
                {shownProjects.map((p) => (
                  <PickerRow
                    key={p.projectId}
                    title={p.title}
                    meta={`${p.ownerName} · ${formatMoney(p.raisedCents)} raised`}
                    selected={false}
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
          <label className="g-label" htmlFor={`note-${gift.giftId}`}>
            A note (optional)
          </label>
          <textarea
            id={`note-${gift.giftId}`}
            className="g-input"
            style={{ marginTop: 10, minHeight: 84, resize: "vertical" }}
            rows={3}
            maxLength={NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Say why, if you like."
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
          <p className="g-hint" style={{ marginTop: 4, paddingLeft: 28 }}>
            They'll see "Someone gave you {amount}."
          </p>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <button
          type="button"
          className="g-btn g-btn-citron"
          onClick={confirm}
          disabled={!ready || busy}
          aria-label={ready ? label : undefined}
          style={{ opacity: !ready || busy ? 0.5 : 1, maxWidth: "100%" }}
        >
          {busy ? busyLabel : label}
        </button>
        {error && (
          <p style={{ marginTop: 10, fontSize: 14.5, color: BODY }} role="alert">
            {error}
          </p>
        )}
        <p className="g-hint" style={{ marginTop: 14 }}>
          {CLAIMS.memberDirectedDefault} Pick by {formatDate(gift.defaultAt)}.
        </p>
      </div>
    </section>
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
  let lines: ReactNode[] = [];
  if (done.target === "creative") {
    heading = `You gave ${amount} to ${done.recipientName ?? "them"}.`;
    lines = [
      CLAIMS.memberDirectedFull,
      done.visible ? "They'll get a note that it came from you." : `They'll see "Someone gave you ${amount}."`,
    ];
  } else if (done.target === "project") {
    heading = `You gave ${amount} to ${done.projectTitle ?? "the project"}.`;
    lines = ["It shows on the project as a backing."];
  } else {
    heading = `Your ${amount} stays in the grant fund.`;
    lines = [POOL_SECOND_SENTENCE];
  }

  const askName =
    done.target === "creative"
      ? done.recipientName ?? "them"
      : done.target === "project"
        ? (done.projectTitle ?? "the project")
        : "the Sophia Fund";

  return (
    <section style={{ borderLeft: `2px solid ${CITRON}`, paddingLeft: 16, marginBottom: 48 }} aria-live="polite">
      <span className="g-badge g-badge-citron">Given · {amount}</span>
      <h2 className="g-h" style={{ marginTop: 10, fontSize: 22, lineHeight: 1.15 }}>
        {heading}
      </h2>
      <p style={{ marginTop: 8, fontSize: 17, color: BODY }}>{lines.join(" ")}</p>

      {!skipped && (
        <div style={{ marginTop: 28 }}>
          <span className="g-label">Add your own</span>
          <h3 className="g-h" style={{ marginTop: 8, fontSize: 22, lineHeight: 1.15 }}>
            Add more {done.target === "fund" ? "to" : "for"} {askName}?
          </h3>
          {done.target === "fund" ? (
            <FundPlusUp done={done} userId={userId} email={email} capture={capture} />
          ) : (
            <PlusUpForm done={done} capture={capture} />
          )}
          <button type="button" className="g-btn g-btn-ghost" style={{ marginTop: 16 }} onClick={() => setSkipped(true)}>
            Not this month
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
  const [monthly, setMonthly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cents = choice === "custom" ? Math.round(parseFloat(custom || "0") * 100) : choice;
  const valid = Number.isFinite(cents) && cents >= MIN_PLUS_UP_CENTS;
  const label = valid ? `Add ${formatMoney(cents)} ${monthly ? "a month" : "once"}` : "Add your own";

  async function go() {
    if (busy) return;
    if (!valid) {
      setError(`Add at least ${formatMoney(MIN_PLUS_UP_CENTS)}.`);
      return;
    }
    setError(null);
    setBusy(true);
    capture("giving_plus_up_started", { target: done.target, recurring: monthly });
    try {
      let url: string;
      if (done.target === "creative" && done.recipientUserId) {
        ({ url } = await giftCheckout({
          recipientUserId: done.recipientUserId,
          amountCents: cents,
          recurring: monthly,
          visible: done.visible,
          memberGiftId: done.giftId,
        }));
      } else if (done.target === "project" && done.projectId) {
        ({ url } = await backingCheckout({
          projectId: done.projectId,
          amountCents: cents,
          recurring: monthly,
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
      <div
        role="radiogroup"
        aria-label="How often"
        style={{ display: "inline-flex", border: `1px solid ${HAIR}`, borderRadius: 10, padding: 3 }}
      >
        {[
          { m: false, text: "One time" },
          { m: true, text: "Monthly" },
        ].map((o) => (
          <button
            key={o.text}
            type="button"
            role="radio"
            aria-checked={monthly === o.m}
            onClick={() => setMonthly(o.m)}
            style={{
              fontFamily: "var(--g-mono, monospace)",
              fontSize: 13.5,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "10px 16px",
              minHeight: 44,
              borderRadius: 8,
              cursor: "pointer",
              background: monthly === o.m ? PAPER : "transparent",
              color: monthly === o.m ? "#121212" : PAPER,
            }}
          >
            {o.text}
          </button>
        ))}
      </div>

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
      <p className="g-hint-body" style={{ marginTop: 12, fontSize: 14.5, color: BODY }}>
        {CLAIMS.patron} {CLAIMS.processingFee}
      </p>
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
  const monthly = fundPage?.org?.monthlyPaymentLinkUrl;

  const links = useMemo(() => {
    if (!userId) return { once: undefined, monthly: undefined };
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
    return { once: build(once), monthly: build(monthly) };
  }, [done.giftId, userId, email, once, monthly]);

  if (!links.once && !links.monthly) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {links.once && (
          <a
            href={links.once}
            className="g-btn g-btn-citron"
            onClick={() => capture("giving_plus_up_started", { target: "fund", recurring: false })}
          >
            Give once to the Sophia Fund
          </a>
        )}
        {links.monthly && (
          <a
            href={links.monthly}
            className={links.once ? "g-btn g-btn-ghost" : "g-btn g-btn-citron"}
            onClick={() => capture("giving_plus_up_started", { target: "fund", recurring: true })}
          >
            Give monthly to the Sophia Fund
          </a>
        )}
      </div>
      <p className="g-hint-body" style={{ marginTop: 12, fontSize: 14.5, color: BODY }}>
        {CLAIMS.grantFundDeductible} Secure checkout on Abiding Practice's Stripe page. Your receipt comes from them,
        then you return here.
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
          else did = g.decidedBy === "default" ? "Stayed in the grant fund. You didn't pick." : "Left it in the grant fund";
          const plusUp = g.plusUpCents ?? 0;
          return (
            <HistoryRow
              key={g.giftId}
              period={formatPeriod(g.period)}
              did={did}
              added={plusUp > 0 ? `Added ${formatMoney(plusUp)}` : "—"}
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

function HistoryRow({ period, did, added }: { period: string; did: string; added: string }) {
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
      <span style={{ color: "var(--g-muted)", fontSize: 14.5 }}>{added}</span>
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
                Connect your bank in Settings to get it. It waits for you until you do.
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
          const did =
            r.source === "plus_up" ? `${r.giverName} backed you with ${amount}` : `${r.giverName} gave you ${amount}`;
          return (
            <HistoryRow
              key={r.id}
              period={formatPeriod(r.period)}
              did={did}
              added={r.transferred ? "Sent to your bank" : "—"}
            />
          );
        })}
      </div>
    </section>
  );
}
