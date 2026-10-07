// The panel of an opened card: meta line and close button, title, who's
// behind it, a few lines, and the one thing to do. A project adds a few
// labelled rows (stage, funding, open roles, pay) before the button. Beside a picture it takes
// the right-hand side (the picture's width is set in DeskCard.tsx); a card
// with no picture is this panel alone, a centered sheet. From the handoff,
// "Opened card".
//
// A Shortlist card adds three things (docs/handoff/favorites-redesign/
// README.md, level 3): a status line, buttons that follow the item's state
// (ShortlistActions.tsx), and ← / → through the list it was opened from.
//
// The panel mounts when a card opens and unmounts a beat after it closes, so
// its queries (a profile's bio, whether I'm going) only run while it's up.
// Hooks run unconditionally; a query that doesn't apply is skipped.
//
// The panel is a size container (`@container`), and its padding and its title
// follow its own width, not the window's: the picture side's share is set in
// DeskCard.tsx, so on a tablet held upright the column can be well under 400px
// and the type has to fit it. Container queries and cqi units, so the same rule
// holds from a phone to a wide desk with no device checks.

import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Link, useNavigate } from "react-router";
import { CaretLeft, CaretRight, X } from "@phosphor-icons/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PersonAvatar } from "../components/PersonAvatar";
import { PeopleFaces } from "../components/PeopleFaces";
import { useReducedMotion } from "../hooks/useMediaQuery";
import { errorMessage } from "../lib/convexError";
import type { DeskAction, DeskCard } from "./deskCards";
import type { DeskCardId } from "./deskState";
import { plainText } from "./deskCards";
import { ShortlistActions } from "./ShortlistActions";
import { LinkedText } from "../components/LinkedText";
import { CARD_BUTTON_CLASS, DESK, DESK_MONO, DESK_SANS, FOCUS_RING_CLASS, monoLabel } from "./tokens";
import { GoingLine } from "./GoingLine";
import { HostedBy } from "../components/HostedBy";
import { useUpdateClick } from "./useUpdateReads";
import { useFinishCelebration } from "./useCelebrations";

/** ← / → through the list a card was opened from: "2 of 6". `arrived` is
 *  the way the last step went, when this card was reached by one: focus
 *  lands on that step button again, so the next press goes on. `busy`: the
 *  card's action is running, and stepping waits for it (ShortlistActions
 *  reports through `onBusy`). */
export type Stepper = {
  index: number;
  total: number;
  onStep: (by: -1 | 1) => void;
  arrived?: -1 | 1;
  busy?: boolean;
  onBusy?: (busy: boolean) => void;
};

// 40px with a mouse, 44px under a finger (the tap target the platforms ask for).
const ROUND_CLASS = `flex h-10 w-10 pointer-coarse:h-11 pointer-coarse:w-11 shrink-0 items-center justify-center rounded-full border border-[#333] bg-transparent text-[#F4F4F2] transition-colors enabled:hover:border-[#FFE066] enabled:hover:text-[#FFE066] disabled:opacity-35 ${FOCUS_RING_CLASS}`;

/** A name in the panel's words that goes to its page (a celebration's person,
 *  project or fund): underlined in the words' own color, the accent on hover. */
const NAME_LINK_CLASS = `underline decoration-1 underline-offset-[0.18em] transition-colors hover:text-[#FFE066] ${FOCUS_RING_CLASS}`;

/** Five lines of the description, then an ellipsis. */
const CLAMP_5: CSSProperties = { display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden" };

/** The panel's padding, from its own width: 24px in a narrow column, the full
 *  56px (48px for a project or a sheet) from about 560px, as it always was. */
const PAD = "clamp(24px, 10cqi, 56px)";
const PAD_TIGHT = "clamp(24px, 10cqi, 48px)";
/** The title: 44px from a 440px panel up, 28px at the narrowest, so a long word
 *  still fits a line of its own in the column. */
const TITLE_SIZE = "clamp(28px, 10cqi, 44px)";
const TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontSize: TITLE_SIZE,
  lineHeight: 1.08,
  fontWeight: 500,
  letterSpacing: "-0.02em",
  wordBreak: "normal",
  overflowWrap: "break-word",
  hyphens: "manual",
  textWrap: "balance",
};
/** The header: meta line and close button. With a stepper, a panel 28rem or
 *  wider has room for all three on one row; narrower, the stepper drops to a
 *  row of its own under them and the close button stays at the top right. */
const HEADER = "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-3";
const HEADER_STEPPED = `${HEADER} @[28rem]:grid-cols-[minmax(0,1fr)_auto_auto]`;

/** "NOV 6 · 6PM · LIGHT CHURCH" as its items. The meta line wraps between
 *  them, so a date or a place is never split. */
export function metaParts(meta: string): string[] {
  return meta
    .split(/\s+·\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** The meta line. Each item is one unit that moves to the next line whole (and
 *  only wraps inside itself if it is wider than the line); the separator stays
 *  with the item before it. The text reads the same as the string it came from. */
function MetaLine({ meta }: { meta: string }) {
  const parts = metaParts(meta);
  return (
    // 15px, the nav size: at 12px the date and place read as fine print beside
    // a 44px title (Rick, 2026-10-05).
    <p className="min-w-0 pt-2 pointer-coarse:pt-2.5" style={{ ...monoLabel(15, "0.14em"), color: DESK.accent, margin: 0, lineHeight: 1.5 }}>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && " "}
          <span style={{ display: "inline-block", maxWidth: "100%", overflowWrap: "break-word" }}>{i < parts.length - 1 ? `${part} ·` : part}</span>
        </Fragment>
      ))}
    </p>
  );
}

export function DetailPanel({
  card,
  visible,
  sheet,
  share,
  onClose,
  stepper,
}: {
  card: DeskCard;
  visible: boolean;
  /** No picture side: the panel fills the card. */
  sheet: boolean;
  /** Width of the picture side, as a share of the open card. */
  share: number;
  /** Closes the card; given an id, only if that card is still the one open. */
  onClose: (only?: DeskCardId) => void;
  stepper?: Stepper;
}) {
  const reduced = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const arrived = stepper?.arrived;

  // A followed person's bio isn't in the list the card came from.
  const profile = useQuery(
    api.profiles.getProfile,
    card.profileId ? { profileId: card.profileId as Id<"profiles"> } : "skip",
  );

  useEffect(() => {
    if (!visible) return;
    const step = arrived ? rootRef.current?.querySelector<HTMLButtonElement>(`[data-step="${arrived}"]:not(:disabled)`) : null;
    (step ?? closeRef.current)?.focus({ preventScroll: true });
    // Where focus lands when the panel comes up, not on every step after.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const description = card.detail.description || plainText(profile?.bio, 500);
  const host = card.detail.host ?? (profile?.location || null);
  const action = card.detail.action;
  // A project's panel carries rows under the description, so it spends less
  // space between its parts to fit a laptop-height window.
  const project = card.kind === "project";
  const facts = card.detail.facts ?? [];
  // A Shortlist card steps through its list: the stepper joins the close button.
  const stepped = !!stepper && stepper.total > 1;

  return (
    <div
      ref={rootRef}
      aria-hidden={!visible}
      className="@container"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: sheet ? 0 : `${share * 100}%`,
        background: DESK.panel,
        overflowY: "auto",
        color: DESK.text,
        fontFamily: DESK_SANS,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        // Fades in 400ms after a 260ms wait; goes quickly when the card closes.
        transition: reduced ? "none" : visible ? `opacity 400ms ${DESK.ease} 260ms` : "opacity 160ms linear",
      }}
    >
      {/* The padding lives here, not on the scroller, so it follows the panel's
          width (a container's own padding can't use its own cqi). */}
      <div className="flex flex-col" style={{ minHeight: "100%", boxSizing: "border-box", padding: sheet || project ? PAD_TIGHT : PAD, gap: 20 }}>
        <div className={stepped ? HEADER_STEPPED : HEADER}>
          <MetaLine meta={card.detail.meta} />
          {stepped && stepper && (
            <div className="col-span-2 row-start-2 justify-self-end @[28rem]:col-span-1 @[28rem]:col-start-2 @[28rem]:row-start-1">
              <StepControls stepper={stepper} />
            </div>
          )}
          <button
            ref={closeRef}
            type="button"
            onClick={() => onClose()}
            aria-label="Close"
            className={stepped ? `${ROUND_CLASS} col-start-2 row-start-1 @[28rem]:col-start-3` : `${ROUND_CLASS} col-start-2 row-start-1`}
          >
            <X size={18} weight="regular" aria-hidden />
          </button>
        </div>

        {/* Grows to fill the panel and centers when there's room, but never
            shrinks below its content: a centered column that overflows spills
            out of the top too, over the meta line. Long text scrolls instead. */}
        <div className="flex shrink-0 grow flex-col justify-center" style={{ gap: project ? 14 : 20 }}>
          {card.detail.status && (
            <p
              style={{
                ...monoLabel(12, "0.14em"),
                alignSelf: "flex-start",
                margin: 0,
                padding: "7px 10px",
                borderRadius: 6,
                border: "1px solid rgba(255,224,102,.35)",
                background: "rgba(255,224,102,.08)",
                color: DESK.accent,
              }}
            >
              {card.detail.status}
            </p>
          )}
          {/* The title wraps between words. A word breaks mid-way only when it is
              wider than the whole line (break-word, not anywhere), and the size
              follows the column so that is rare: see TITLE_SIZE. */}
          {card.kind === "person" ? (
            <div className="flex items-center gap-3">
              <PersonAvatar name={card.detail.title} imageUrl={profile?.imageUrl ?? card.image} />
              <h2 style={TITLE_STYLE}>
                <LinkedText text={card.detail.title} links={card.detail.links} className={NAME_LINK_CLASS} />
              </h2>
            </div>
          ) : (
            <h2 style={TITLE_STYLE}>
              <LinkedText text={card.detail.title} links={card.detail.links} className={NAME_LINK_CLASS} />
            </h2>
          )}
          {/* An event's hosts link to their pages, as on the event page. */}
          {card.detail.hosts && card.detail.hosts.length > 0 ? (
            <p style={{ margin: 0, fontSize: 15, color: DESK.muted, overflowWrap: "break-word", hyphens: "manual" }}>
              <HostedBy hosts={card.detail.hosts} linkPeople tone="desk" />
            </p>
          ) : (
            host && <p style={{ margin: 0, fontSize: 15, color: DESK.muted, overflowWrap: "break-word", hyphens: "manual" }}>{host}</p>
          )}
          {description && (
            <p
              style={{
                margin: 0,
                fontSize: project ? 17 : 18,
                lineHeight: project ? 1.6 : 1.65,
                color: DESK.textSoft,
                maxWidth: "46ch",
                overflowWrap: "break-word",
                hyphens: "manual",
                // An Update's body, and someone's words to you, are written whole, line breaks and all.
                whiteSpace: card.kind === "update" || card.kind === "celebration" ? "pre-line" : undefined,
                ...(project ? CLAMP_5 : {}),
              }}
            >
              <LinkedText text={description} links={card.detail.links} className={NAME_LINK_CLASS} />
            </p>
          )}
          {facts.length > 0 && (
            <dl
              style={{
                margin: 0,
                display: "grid",
                gridTemplateColumns: "max-content minmax(0, 1fr)",
                columnGap: 20,
                rowGap: 8,
                fontSize: 15,
                lineHeight: 1.45,
              }}
            >
              {facts.map((fact) => (
                <Fragment key={fact.label}>
                  <dt style={{ color: DESK.muted }}>{fact.label}</dt>
                  <dd style={{ margin: 0, color: DESK.text, overflowWrap: "break-word", hyphens: "manual" }}>{fact.value}</dd>
                </Fragment>
              ))}
            </dl>
          )}
          {card.kind === "org" && card.detail.people && (
            <PeopleFaces faces={card.detail.people} count={card.detail.peopleCount ?? 0} />
          )}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3" style={{ marginTop: project ? 4 : 8 }}>
            {action?.kind === "link" && <ActionLink action={action} />}
            {action?.kind === "rsvp" && <JoinButton action={action} />}
            {action?.kind === "update" && <UpdateButton action={action} />}
            {action?.kind === "celebration" && <CelebrationButton action={action} />}
            {/* Keyed by card: stepping to the next item starts its buttons fresh. */}
            {action?.kind === "shortlist" && (
              <ShortlistActions key={card.id} id={card.id} buttons={action.buttons} onDone={onClose} onBusy={stepper?.onBusy} />
            )}
            {card.kind === "event" && card.eventId ? (
              <GoingLine eventId={card.eventId} fallback={card.detail.aside} />
            ) : (
              card.detail.aside && !(card.kind === "org" && card.detail.people?.length) && (
                <span style={{ fontSize: 14, color: DESK.muted }}>{card.detail.aside}</span>
              )
            )}
            {card.kind === "event" && (
              <Link
                to={card.href}
                className={`text-[15px] text-[#F4F4F2] underline-offset-4 transition-colors hover:text-[#FFE066] hover:underline ${FOCUS_RING_CLASS}`}
              >
                Event page →
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepControls({ stepper }: { stepper: Stepper }) {
  const { index, total, onStep, busy } = stepper;
  return (
    <div className="flex items-center gap-2" style={{ fontFamily: DESK_MONO, fontSize: 12, letterSpacing: "0.14em", color: DESK.muted, whiteSpace: "nowrap" }}>
      <button type="button" data-step="-1" onClick={() => onStep(-1)} disabled={busy || index === 0} aria-label="Previous" className={ROUND_CLASS}>
        <CaretLeft size={16} weight="regular" aria-hidden />
      </button>
      <span aria-live="polite">
        {index + 1} of {total}
      </span>
      <button type="button" data-step="1" onClick={() => onStep(1)} disabled={busy || index === total - 1} aria-label="Next" className={ROUND_CLASS}>
        <CaretRight size={16} weight="regular" aria-hidden />
      </button>
    </div>
  );
}

function ActionLink({ action }: { action: Extract<DeskAction, { kind: "link" }> }): ReactNode {
  return (
    <Link to={action.href} className={`${CARD_BUTTON_CLASS} bg-[#FFE066] text-[#121212] hover:bg-[#FFEA94]`}>
      {action.label}
    </Link>
  );
}

/** An Update's button: records the press (which archives the Update), then
 * goes where its link says. In the app it is a router link; another site opens
 * in a new tab. */
function UpdateButton({ action }: { action: Extract<DeskAction, { kind: "update" }> }): ReactNode {
  const pressed = useUpdateClick();
  const className = `${CARD_BUTTON_CLASS} bg-[#FFE066] text-[#121212] hover:bg-[#FFEA94]`;
  if (action.external) {
    return (
      <a href={action.href} target="_blank" rel="noopener noreferrer" onClick={() => pressed(action.updateId)} className={className}>
        {action.label}
      </a>
    );
  }
  return (
    <Link to={action.href} onClick={() => pressed(action.updateId)} className={className}>
      {action.label}
    </Link>
  );
}

/** A celebration's button: marks it done, then says thanks (a conversation
 * with the person, the way a profile's Message button starts one) or goes to
 * its link. */
function CelebrationButton({ action }: { action: Extract<DeskAction, { kind: "celebration" }> }): ReactNode {
  const finishCard = useFinishCelebration();
  const getOrCreateConversation = useMutation(api.messaging.getOrCreateConversation);
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const className = `${CARD_BUTTON_CLASS} bg-[#FFE066] text-[#121212] hover:bg-[#FFEA94]`;
  const { button, notificationId } = action;

  if (button.kind === "link") {
    return (
      <Link to={button.href} onClick={() => finishCard(notificationId)} className={className}>
        {button.label}
      </Link>
    );
  }

  const userId = button.userId;
  async function onClick() {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      const conversation = await getOrCreateConversation({ otherUserId: userId as Id<"users"> });
      // Done only once the way there is open: that takes the card off the
      // canvas, and it shouldn't go before the conversation comes up.
      finishCard(notificationId);
      if (conversation) navigate(`/messages/${conversation._id}`);
    } catch (err) {
      setError(errorMessage(err));
      setStarting(false);
    }
  }

  return (
    <>
      <button type="button" onClick={onClick} disabled={starting} className={className}>
        {button.label}
      </button>
      {error && (
        <span role="alert" style={{ fontSize: 14, color: DESK.muted }}>
          {error}
        </span>
      )}
    </>
  );
}

/** A free event's button. A signed-in member joins the way the event page's
 * Join Event does (events.apply), so the event page, the host's list and the
 * going count all agree. (rsvpToEvent is the guest path; the desk never uses
 * it.) Hidden until the answers are in, so a member who is already going or
 * hosting never sees a button that isn't true. */
function JoinButton({ action }: { action: Extract<DeskAction, { kind: "rsvp" }> }) {
  const eventId = action.eventId as Id<"events">;
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  // The event page's own answer: my application's status, and whether I host.
  const event = useQuery(api.events.get, { eventId });
  // An RSVP made before the account existed (a guest's) counts as going too.
  const rsvp = useQuery(api.garden.eventRsvps.getMyRsvpStatus, isAuthenticated ? { eventId } : "skip");
  const apply = useMutation(api.events.apply);
  const [state, setState] = useState<"idle" | "saving" | "joined">("idle");
  const [error, setError] = useState<string | null>(null);

  const settled = !authLoading && event !== undefined && (!isAuthenticated || rsvp !== undefined);
  // Not settled: keep the button's place so the panel doesn't shift when it lands.
  if (!settled) return <span aria-hidden style={{ display: "inline-block", height: 52, width: 148 }} />;
  // A guest joins from the event page (events.apply needs an account); a host
  // manages the event there too.
  if (!isAuthenticated || !event || event.isHost || event.isOrganizer) return null;

  const status = event.userApplication?.status;
  const going = state === "joined" || status === "accepted" || !!rsvp;
  const label = going ? "You're going" : status === "pending" ? "Requested" : status === "declined" ? "Declined" : action.label;
  const done = going || status === "pending" || status === "declined";

  async function onClick() {
    if (done || state === "saving") return;
    setState("saving");
    setError(null);
    try {
      await apply({ eventId });
      setState("joined");
    } catch (err) {
      setState("idle");
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={done || state === "saving"}
        className={
          going || status === "pending"
            ? `${CARD_BUTTON_CLASS} cursor-default border border-[#FFE066] bg-[rgba(255,224,102,0.1)] text-[#FFE066]`
            : done
              ? `${CARD_BUTTON_CLASS} cursor-default border border-[#333] bg-transparent`
              : `${CARD_BUTTON_CLASS} border border-transparent bg-[#FFE066] text-[#121212] hover:bg-[#FFEA94] disabled:opacity-70`
        }
        style={status === "declined" && !going ? { color: DESK.muted } : undefined}
      >
        {label}
      </button>
      <span role="status" aria-live="polite" style={{ fontSize: 14, color: "#FF9B8F", flexBasis: error ? "100%" : undefined }}>
        {error}
      </span>
    </>
  );
}
