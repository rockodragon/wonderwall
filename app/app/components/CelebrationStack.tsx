// Celebrations stacked at the top of Today on a phone, the phone's twin of
// the canvas's celebration cards (lib/celebrations.ts): someone cheered you
// on, offered help, backed you or gave to you, or a fund awarded you. Each is
// a card in the page's own language, beside the Updates (UpdatesStack.tsx):
// what happened, their words, the button, and "Got it". "Got it" and the
// button both mark it done, which takes it off Today and the canvas. An award
// gets confetti the first time it shows.
//
// Hooks stay above every return. Everything here is optional: if the query
// can't be read (the backend not deployed yet), Today shows without it.

import { Component, useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useNavigate } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useReducedMotion } from "../hooks/useMediaQuery";
import { throwConfetti } from "../lib/celebrate";
import {
  awardsToCelebrate,
  celebratedIds,
  celebrationButton,
  celebrationIcon,
  celebrationKicker,
  celebrationLinks,
  isAward,
  leadsWithAmount,
  rememberCelebrated,
  type CelebrationLike,
} from "../lib/celebrations";
import { errorMessage } from "../lib/convexError";
import { formatMoney } from "../garden/ui";
import { DESK, DESK_SCRIPT } from "../desk/tokens";
import { CelebrationMark } from "./CelebrationMark";
import { LinkedText } from "./LinkedText";

const MONO: CSSProperties = { fontFamily: "var(--garden-font-mono)" };
const DISPLAY: CSSProperties = { fontFamily: "var(--garden-font-display)" };
const CARD: CSSProperties = {
  backgroundColor: "var(--app-surface-raised)",
  borderColor: "var(--app-hairline)",
};
const BUTTON = "inline-flex items-center rounded-lg px-4 py-2.5 text-[13.5px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-60";
const PRIMARY: CSSProperties = { backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" };
/** The button on an award's paper: ink, so it holds against the cream. */
const ON_PAPER: CSSProperties = { backgroundColor: DESK.paperInk, color: DESK.paper };

/** Renders nothing if anything under it fails, so Today never goes down with it. */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function CelebrationStack() {
  return (
    <Quiet>
      <Stack />
    </Quiet>
  );
}

function Stack() {
  const celebrations = useQuery(api.notifications.listCelebrations);
  const finish = useMutation(api.notifications.finishCelebration);
  const reduced = useReducedMotion();
  // "Got it" hides the card at once; the list catches up a moment later.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  const finishCard = useCallback(
    (id: string) => {
      setHidden((prev) => new Set(prev).add(id));
      finish({ notificationId: id as Id<"notifications"> }).catch(() => {
        setHidden((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
    },
    [finish],
  );

  const shown: CelebrationLike[] = (celebrations ?? []).filter((c) => !hidden.has(c._id));

  // Confetti the first time an award is here, once per award per browser.
  const awards = awardsToCelebrate(shown, new Set()).join(" ");
  useEffect(() => {
    if (!awards) return;
    const done = celebratedIds();
    const fresh = awards.split(" ").filter((id) => !done.has(id));
    if (fresh.length === 0) return;
    const timer = setTimeout(() => {
      rememberCelebrated(fresh);
      throwConfetti(reduced);
    }, 450);
    return () => clearTimeout(timer);
  }, [awards, reduced]);

  if (shown.length === 0) return null;

  return (
    <section aria-label="For you" className="mb-14 space-y-4">
      {shown.map((c) => (
        <CelebrationCard key={c._id} celebration={c} onFinish={finishCard} />
      ))}
    </section>
  );
}

/** The paper an award is written on, the canvas's note colors (desk/tokens.ts). */
const PAPER: CSSProperties = { backgroundColor: DESK.paper, borderColor: DESK.paper, color: DESK.paperInk };
const NAME_LINK = "underline decoration-1 underline-offset-[0.18em] hover:opacity-80";

function CelebrationCard({ celebration: c, onFinish }: { celebration: CelebrationLike; onFinish: (id: string) => void }) {
  const button = celebrationButton(c);
  const icon = celebrationIcon(c.type);
  const links = celebrationLinks(c);
  const award = isAward(c);
  const amount = leadsWithAmount(c) && c.amountCents ? formatMoney(c.amountCents) : null;
  const message = c.message.trim();
  const quote = c.type === "encouragement" && message ? `“${message}”` : message;
  const ink = award ? DESK.paperInk : "var(--app-text)";

  return (
    <article className="relative overflow-hidden rounded-xl border" style={award ? PAPER : CARD}>
      {icon && (
        <CelebrationMark
          icon={icon}
          size={30}
          color={award ? DESK.paperInk : "var(--app-accent-ink)"}
          style={{ position: "absolute", top: 18, right: 18 }}
        />
      )}
      <div className="flex gap-4 p-5">
        {!award && c.from?.imageUrl && (
          <img src={c.from.imageUrl} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-full object-cover" />
        )}
        <div className="min-w-0 flex-1 pr-10">
          <p className="text-xs uppercase tracking-[0.16em]" style={{ ...MONO, color: award ? DESK.paperInk : "var(--app-accent-ink)" }}>
            {celebrationKicker(c.type)}
          </p>
          <span aria-hidden className="mt-3 block h-0.5 w-7" style={{ backgroundColor: award ? DESK.paperInk : "var(--garden-citron)" }} />
          {award ? (
            // An award: the amount (or what was approved) large, signed by the fund.
            <>
              <h2 className="mt-3 text-4xl font-semibold leading-none break-words" style={{ ...DISPLAY, color: ink }}>
                {amount ?? (message || c.title)}
              </h2>
              {c.fund && (
                <p className="mt-2 -rotate-2 text-[28px] leading-tight" style={{ fontFamily: DESK_SCRIPT, fontWeight: 600, color: ink }}>
                  <LinkedText text={c.fund.name} links={links} className={NAME_LINK} />
                </p>
              )}
              {amount && message && (
                <p className="mt-3 text-[15px] leading-relaxed break-words" style={{ color: ink }}>
                  <LinkedText text={message} links={links} className={NAME_LINK} />
                </p>
              )}
            </>
          ) : (
            <>
              {amount && (
                <p className="mt-3 text-4xl font-semibold leading-none" style={{ ...DISPLAY, color: ink }}>
                  {amount}
                </p>
              )}
              <h2 className="mt-3 text-2xl font-semibold leading-tight break-words" style={{ ...DISPLAY, color: ink }}>
                <LinkedText text={c.title} links={links} className={NAME_LINK} />
              </h2>
              {quote && (
                <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed break-words" style={{ color: ink }}>
                  {quote}
                </p>
              )}
            </>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {button?.kind === "link" && (
              <Link to={button.href} onClick={() => onFinish(c._id)} className={BUTTON} style={award ? ON_PAPER : PRIMARY}>
                {button.label}
              </Link>
            )}
            {button?.kind === "thanks" && (
              <ThanksButton userId={button.userId} label={button.label} onDone={() => onFinish(c._id)} style={award ? ON_PAPER : PRIMARY} />
            )}
            <button
              type="button"
              onClick={() => onFinish(c._id)}
              className={`${BUTTON} border font-medium hover:bg-[var(--app-hairline)]`}
              style={{ borderColor: award ? "rgba(29,27,18,.35)" : "var(--app-hairline-raised)", color: ink, backgroundColor: "transparent" }}
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

/** "Say thanks": starts (or reopens) a conversation with them, the way a
 * profile's Message button does, and marks the card done once it's open. */
function ThanksButton({ userId, label, onDone, style }: { userId: string; label: string; onDone: () => void; style: CSSProperties }) {
  const getOrCreateConversation = useMutation(api.messaging.getOrCreateConversation);
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      const conversation = await getOrCreateConversation({ otherUserId: userId as Id<"users"> });
      onDone();
      if (conversation) navigate(`/messages/${conversation._id}`);
    } catch (err) {
      setError(errorMessage(err));
      setStarting(false);
    }
  }

  return (
    <>
      <button type="button" onClick={onClick} disabled={starting} className={BUTTON} style={style}>
        {label}
      </button>
      {error && (
        <p role="alert" className="w-full text-sm" style={{ color: "var(--app-text)" }}>
          {error}
        </p>
      )}
    </>
  );
}
