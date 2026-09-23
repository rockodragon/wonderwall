// /showcase — the November 6 open call. This is the destination every piece
// of the Instagram acquisition push points at (docs/marketing/
// showcase-open-call.md), so it is public, prerendered, and readable with
// no account.
//
// The page sells a SHOW, not a membership. A juried open call converts far
// better on cold social traffic than "join our community" does: it has a
// deadline, it confers status, it's free to enter, and the account is the
// byproduct of applying rather than the ask. Membership is mentioned once,
// in the FAQ, as what happens after — never as the price of entry. If
// someone edits this page toward "sign up for The Garden," the conversion
// mechanic is gone; keep the call the subject.
//
// LENGTH IS A FEATURE OF THE FAILURE MODE. Every rewrite of this page has
// grown it, and a long page on cold mobile traffic is a page nobody reaches
// the bottom of. The prose here has been cut to roughly half of what it was
// and should stay that way: short declarative sentences, no triads, no
// "not X but Y" reversals. If a paragraph explains the same thing a FAQ
// item already answers, delete the paragraph, not the FAQ.
//
// The pitch is one frame and it must not be softened back into poetry: a
// creative's only two offers are unpaid faith (the church wants it donated)
// or faithless funding (the gallery wants the faith left out). November 6 is
// a third offer. Earlier drafts described the night as "one night, a wall,
// people who came to look" — that got cut for sounding like an apology.
//
// PATRONS ARE HALF THE ROOM, not a footnote. The fundraiser only works if
// people with money show up, so they get their own way to take part
// ("back"), their own persona card, and the Give · Receive · Grow section
// frames the whole economy in the site's own tagline. Anything that pushes
// patrons back below the fold is a regression.
//
// The form is two steps for one reason: the email saves on step one, alone,
// before any other question. An abandoned application still leaves a
// contactable person, and the list is the only asset Meta cannot delete.
// convex/showcase.ts's `apply` also writes that email to the waitlist.
// Step two is a MODAL rather than more page: by the time the email is saved
// the only thing that matters is finishing, and a centered overlay with the
// page blurred behind it removes every other thing to click. Closing it is
// safe by construction — the email is already stored — so Escape and a
// scrim click both dismiss without a confirm.
//
// The FAQ uses native <details>/<summary> rather than a React accordion.
// Collapsed markup that a crawler (or an answer engine) can't read is worse
// than no FAQ at all, and <details> keeps every answer in the prerendered
// HTML while still rendering closed, with keyboard support we'd otherwise
// have to write. Don't "upgrade" it to JS.
//
// "What do you make?" uses the canonical INTERESTS vocabulary from
// constants/interests.ts, the same axis People, Projects and Offerings use.
// This page used to invent its own nine-item discipline list, which meant an
// applicant who became a member had to describe themselves twice and the two
// answers could never be joined. One vocabulary, everywhere.
//
// The hero drawing is inverted (filter: invert(1)) rather than re-exported:
// it's ink on white paper, and the Garden shell is paper on ink. Inversion
// turns the pen lines into light on dark and costs nothing at build time.

import { useEffect, useId, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { INTERESTS } from "../constants/interests";
import { GardenPage, SectionLabel } from "../garden/ui";
import "../garden/garden.css";

export function meta() {
  return [
    { title: "Open call — show your work November 6 | creatives.exchange" },
    {
      name: "description",
      content:
        "Twenty Christian creatives will show work on November 6 in Encinitas. Free to apply, no membership required. Rolling selection, applications close October 22.",
    },
    { property: "og:title", content: "Open call: show your work November 6" },
    {
      property: "og:description",
      content:
        "Painters, apparel makers, musicians, photographers. Free to apply. Closes October 22.",
    },
    { property: "og:type", content: "website" },
    // Absolute, like every other route here — a relative og:image doesn't
    // unfurl on Instagram, iMessage or Slack, and this link's whole job is
    // to be pasted into those. The drawing is 1330x795 (1.67:1) rather than
    // the 1.91:1 ideal; large-summary cards letterbox it rather than crop.
    { property: "og:image", content: OG_IMAGE },
    { property: "og:image:width", content: "1330" },
    { property: "og:image:height", content: "795" },
    { name: "twitter:card", content: "summary_large_image" },
    {
      name: "twitter:title",
      content: "Open call: show your work November 6",
    },
    {
      name: "twitter:description",
      content:
        "Painters, apparel makers, musicians, photographers. Free to apply. Closes October 22.",
    },
    { name: "twitter:image", content: OG_IMAGE },
  ];
}

const OG_IMAGE = "https://creatives.exchange/showcase/table-drawing.jpg";

const EVENT_DATE = "Friday, November 6, 2026";
const EVENT_PLACE = "Lightchurch, Encinitas, California";
const CLOSE_DATE = "October 22";
/** Hard backstop for a decision — a few days after CLOSE_DATE, and well
    clear of the show so selected work has time to actually get here. The
    page promises ROLLING review (read on arrival, decided continuously)
    with this as the outer bound. If CLOSE_DATE moves, move this with it and
    keep it before EVENT_DATE. */
const DECISION_BY = "October 26";
const SPOTS = 20;

// Admission. November 6 is a ticketed fundraiser for the Grant Fund
// (docs/handoff/nov6-backings.md), so NOBODY is comped — selected creatives
// buy a ticket like everyone else, and the page has to say so plainly rather
// than let an applicant discover it after they've been accepted.
//
// Two prices, one room. The creatives this call recruits are the people
// least able to absorb a benefit ticket, and the patrons are who the
// fundraiser is actually aimed at — one flat price would either price out
// the applicants or leave donor money on the table.
const TICKET_TIERS = [
  {
    label: "Creative",
    price: "$25",
    note: "If you're showing, playing, selling or just make things.",
  },
  {
    label: "Patron",
    price: "$75",
    note: "Covers your seat and helps cover someone else's.",
  },
] as const;

/** Short form for the facts table. */
const TICKET_SUMMARY = "$25 creative · $75 patron";

/** The table fee. Named rather than inlined because it appears in three
    places (the participation card, the apparel persona, the FAQ) and they
    must not drift. */
const TABLE_FEE = "$50";

// Per-event ticketing isn't built — docs/events-video-hosting-prd.md keeps it
// out of scope, and events use an off-platform payment link instead. So this
// stays null until there's a real checkout URL to point at. Prices above show
// either way; only the button waits on this.
const TICKET_URL: string | null = null;

/** Where a price badge sends someone. The badges are CLICKABLE even with no
    checkout: a patron who taps "$75" and lands on a dead div is gone, while
    one who lands on the email field is on the list and gets the link the day
    it exists. Falling back to the form is worth more than the ticket sale we
    can't take yet. */
const TICKET_HREF = TICKET_URL ?? "#apply";

/** How many canonical interests one applicant may claim. Mirrors
    MAX_INTERESTS in convex/showcase.ts — the server is the real limit, this
    only stops someone hitting it by surprise. */
const MAX_INTERESTS = 8;

// The ways to take part. "back" is the patron lane and it lives in the same
// list as the four creative ones on purpose: a patron is a participant, not
// an audience member, and splitting the lists into "make" and "give" put
// the money on the other side of a wall from the work.
const PARTICIPATION = [
  {
    value: "exhibit",
    label: "Show work",
    note: "Physical or digital. Not all of it has to be in the room.",
  },
  {
    value: "perform",
    label: "Play or read",
    note: "Music and spoken word both. Paid. Set length depends on how many play.",
  },
  {
    value: "vend",
    label: "Sell at a table",
    note: `${TABLE_FEE}, and there aren't many. You keep what you sell.`,
  },
  {
    value: "document",
    label: "Photograph the night",
    note: "Credited, and your shots stay yours. You still buy a ticket.",
  },
  {
    value: "back",
    label: "Back the work",
    note: "Patron ticket, a commission, or money into the grant fund. You meet who it goes to.",
  },
] as const;

type Participation = (typeof PARTICIPATION)[number]["value"];

// ————— Line drawings —————
//
// Inline SVG in the same continuous-pen style as the hero drawing, rather
// than icons from a set: this page's whole visual language is one unbroken
// ink line, and a geometric icon font next to that drawing reads as a
// different product. Loose, slightly-off curves on purpose — a perfect
// circle looks machine-made beside a hand-drawn table.
//
// currentColor throughout, so they inherit whatever the surrounding text is
// and need no dark-mode variant.

function Ink({
  d,
  label,
  size = 44,
}: {
  d: string;
  label: string;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label={label}
      style={{ width: size, height: size, display: "block" }}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

/** A framed piece on a wall, hung slightly crooked. */
const INK_FRAME =
  "M13 17 L50 14 L52 44 L15 47 Z M13 17 C22 23 30 21 36 28 C40 33 46 30 52 36 M8 54 L57 51";
/** A guitar body with a neck, and a mic stand behind it. */
const INK_PLAY =
  "M22 52 C13 52 10 43 15 37 C19 32 26 34 28 28 C30 22 27 17 31 14 M31 14 C36 17 33 23 34 29 C36 36 43 36 44 43 C45 50 37 55 30 53 M22 41 C25 38 30 38 33 41 M46 50 L46 22 M41 18 C41 13 51 13 51 18 C51 23 41 23 41 18";
/** A table with things on it. */
const INK_TABLE =
  "M8 34 L56 31 M12 34 L14 52 M52 31 L54 49 M20 33 L20 25 L29 24 L30 32 M35 32 C35 26 44 26 44 31";
/** A camera, held. */
const INK_CAMERA =
  "M11 24 L24 22 L27 17 L40 16 L44 21 L55 20 L57 45 L13 49 Z M34 25 C41 25 44 31 42 36 C40 41 32 42 29 37 C26 32 29 25 34 25 M17 28 L21 28";
/** A tee laid flat, one sleeve shorter than the other. */
const INK_SHIRT =
  "M24 16 L14 21 L10 31 L18 35 L20 30 L20 50 C28 53 38 53 45 50 L45 30 L47 35 L55 30 L50 20 L41 16 M24 16 C27 23 38 23 41 16";
/** A brush at an angle, over the stroke it just made. */
const INK_BRUSH =
  "M15 51 C10 46 12 38 19 38 L37 18 C40 15 46 20 43 23 L25 43 C28 48 21 56 15 51 M9 58 C19 53 27 58 38 54 C46 51 52 54 56 58";
/** Two hands cupped under a sprout — give, and what grows out of it. */
const INK_HANDS =
  "M11 34 C11 46 20 55 32 55 C44 55 53 46 53 34 M32 31 C32 22 26 17 19 18 C20 26 25 31 32 31 M32 31 C32 21 39 16 46 17 C45 26 39 31 32 31 M32 31 L32 44";

const PARTICIPATION_INK: Record<Participation, string> = {
  exhibit: INK_FRAME,
  perform: INK_PLAY,
  vend: INK_TABLE,
  document: INK_CAMERA,
  back: INK_HANDS,
};

// ————— Page-local CSS —————
//
// Two things inline styles genuinely can't express: the ::marker pseudo-
// elements that hide the browser's default <details> triangle, and the
// [open] state that flips + to −. Kept here rather than in garden.css
// because nothing else in the system uses a disclosure yet; promote it the
// second a second page needs one.
const PAGE_CSS = `
.sc-faq > summary { list-style: none; cursor: pointer; }
.sc-faq > summary::-webkit-details-marker { display: none; }
.sc-faq > summary::marker { content: ""; }
.sc-faq > summary:hover .sc-faq-q { color: var(--g-citron); }
.sc-faq > summary .sc-faq-mark::after { content: "+"; }
.sc-faq[open] > summary .sc-faq-mark::after { content: "–"; }
.sc-ticket:hover { border-color: var(--g-citron); }
`;

// ————— Small presentational pieces —————

function Section({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section style={{ marginTop: 56 }}>
      <SectionLabel>{label}</SectionLabel>
      <hr className="g-rule" style={{ margin: "10px 0 22px" }} />
      {children}
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return (
    <p style={{ fontSize: 16.5, lineHeight: 1.65, marginTop: 14 }}>{children}</p>
  );
}

/** One of the "who this is for" cards. The heading is the person's own
    sentence about themselves, not our description of them — that's the line
    that makes a stranger stop scrolling and think "that's me." The drawing
    is there so the five cards can be told apart at a glance on a phone,
    where they otherwise read as one grey wall of quotes. */
function WhoCard({
  quote,
  who,
  body,
  ink,
}: {
  quote: string;
  who: string;
  body: string;
  ink: string;
}) {
  return (
    <div
      className="g-card"
      style={{ marginTop: 14, display: "flex", gap: 16, alignItems: "flex-start" }}
    >
      <span style={{ color: "var(--g-citron)", flexShrink: 0, marginTop: 2 }}>
        <Ink d={ink} label={who} size={38} />
      </span>
      <div>
        <div className="g-label" style={{ color: "var(--g-citron)" }}>{who}</div>
        <p
          className="g-h"
          style={{ fontSize: 19, marginTop: 8, lineHeight: 1.3 }}
        >
          “{quote}”
        </p>
        <p style={{ fontSize: 15.5, lineHeight: 1.6, marginTop: 10 }}>{body}</p>
      </div>
    </div>
  );
}

function FactLine({ k, v }: { k: string; v: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "baseline",
        padding: "9px 0",
        borderBottom: "1px solid var(--g-hairline)",
      }}
    >
      <span className="g-label" style={{ minWidth: 96, flexShrink: 0 }}>
        {k}
      </span>
      <span style={{ fontSize: 15.5, color: "var(--g-paper)" }}>{v}</span>
    </div>
  );
}

/** One beat of Give · Receive · Grow. Citron key, one line of value — if a
    beat needs a paragraph the economy is too complicated to pitch. */
function Beat({ word, line }: { word: string; line: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "baseline",
        padding: "10px 0",
        borderBottom: "1px solid var(--g-hairline)",
      }}
    >
      <span
        className="g-label"
        style={{ minWidth: 80, flexShrink: 0, color: "var(--g-citron)" }}
      >
        {word}
      </span>
      <span style={{ fontSize: 15.5, lineHeight: 1.55 }}>{line}</span>
    </div>
  );
}

/** A native disclosure styled as a Garden card. See PAGE_CSS for why this
    isn't a React accordion. */
function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="g-card sc-faq" style={{ padding: 0 }}>
      <summary
        style={{
          display: "flex",
          gap: 14,
          alignItems: "baseline",
          justifyContent: "space-between",
          padding: "15px 20px",
        }}
      >
        <span
          className="sc-faq-q"
          style={{ color: "var(--g-paper)", fontSize: 16.5, lineHeight: 1.4 }}
        >
          {q}
        </span>
        <span
          className="g-mono sc-faq-mark"
          aria-hidden="true"
          style={{ color: "var(--g-citron)", fontSize: 18, flexShrink: 0 }}
        />
      </summary>
      <div
        style={{
          padding: "0 20px 18px",
          fontSize: 15.5,
          lineHeight: 1.65,
        }}
      >
        {children}
      </div>
    </details>
  );
}

/** Interest chips reuse the participation-checkbox affordance rather than a
    <select>: a multi-select native control is unusable on a phone, and the
    canonical list is 26 items long. */
function chipStyle(on: boolean, locked: boolean): CSSProperties {
  return {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: 12.5,
    letterSpacing: "0.06em",
    padding: "7px 11px",
    borderRadius: 3,
    border: `1px solid ${on ? "var(--g-citron)" : "var(--g-hairline)"}`,
    background: on ? "var(--g-citron)" : "transparent",
    color: on ? "var(--g-ink)" : "var(--g-body)",
    cursor: locked ? "default" : "pointer",
    opacity: locked ? 0.35 : 1,
  };
}

// ————— The form —————

function ApplyForm({ id }: { id?: string }) {
  const apply = useMutation(api.showcase.apply);
  const answer = useMutation(api.showcase.answerApplication);

  const [step, setStep] = useState<"email" | "details" | "done">("email");
  /** Separate from `step` so dismissing the overlay doesn't throw away the
      answers already typed into it — reopening lands back on the same form,
      and the inline card below keeps a way back in. */
  const [modalOpen, setModalOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Someone coming back to a finished application. They still land on step
      two — re-submitting overwrites, which is how you add the better photo
      you took last week — but the copy shouldn't pretend we've never met. */
  const [returning, setReturning] = useState(false);

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [instagram, setInstagram] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [workDescription, setWorkDescription] = useState("");
  const [participation, setParticipation] = useState<Participation[]>([]);

  const headingId = useId();

  // Escape closes. The email is already saved by the time this renders, so
  // there is nothing to confirm and nothing to lose.
  useEffect(() => {
    if (!modalOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setModalOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  // Lock the page behind the overlay. Restoring the previous value rather
  // than clearing it matters because two ApplyForms render on this page and
  // either can own the lock.
  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [modalOpen]);

  function errorText(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    // Convex prefixes thrown errors with its own framing; the applicant
    // should read the sentence we wrote, not a stack frame.
    const match = raw.match(/Uncaught Error:\s*(.+?)(\n|$)/);
    return (match?.[1] ?? raw).slice(0, 200);
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await apply({ email });
      setReturning(result.answered);
      setStep("details");
      setModalOpen(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitDetails(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await answer({
        email,
        name: name || undefined,
        city: city || undefined,
        instagram: instagram || undefined,
        interests: interests.length ? interests : undefined,
        portfolioUrl: portfolioUrl || undefined,
        workDescription: workDescription || undefined,
        participation: participation.length ? participation : undefined,
      });
      setStep("done");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  function toggle(value: Participation) {
    setParticipation((prev) =>
      prev.includes(value)
        ? prev.filter((p) => p !== value)
        : [...prev, value],
    );
  }

  function toggleInterest(value: string) {
    setInterests((prev) =>
      prev.includes(value)
        ? prev.filter((i) => i !== value)
        : prev.length >= MAX_INTERESTS
          ? prev
          : [...prev, value],
    );
  }

  const atCap = interests.length >= MAX_INTERESTS;

  const doneBody = (
    <>
      <div className="g-label" style={{ color: "var(--g-citron)" }}>
        You're in
      </div>
      <p className="g-h" id={headingId} style={{ fontSize: 22, marginTop: 10 }}>
        Application received.
      </p>
      <p style={{ fontSize: 15.5, lineHeight: 1.6, marginTop: 10 }}>
        We read every one as it comes in. You'll hear by email within a few
        days either way, and by {DECISION_BY} at the latest.
      </p>
      <p style={{ fontSize: 15.5, lineHeight: 1.6, marginTop: 12 }}>
        In the meantime,{" "}
        <Link to="/opportunities" style={{ color: "var(--g-citron)" }}>
          see what's being made
        </Link>
        .
      </p>
    </>
  );

  const detailsBody = (
    <form onSubmit={submitDetails}>
      <div className="g-label">
        {returning ? "You've already applied" : "Step 2 of 2 — the work"}
      </div>
      <p className="g-h" id={headingId} style={{ fontSize: 22, marginTop: 10 }}>
        Tell us what you'd bring.
      </p>
      <p className="g-hint" style={{ marginTop: 8 }}>
        {returning
          ? `We already have an application for ${email}. Filling this in again replaces it.`
          : `Saved as ${email}. All optional, but the jury can only go on what you give them.`}
      </p>

      <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <input
            className="g-input"
            style={{ flex: "1 1 180px" }}
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="g-input"
            style={{ flex: "1 1 140px" }}
            placeholder="City"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>

        <input
          className="g-input"
          placeholder="Instagram handle"
          value={instagram}
          onChange={(e) => setInstagram(e.target.value)}
        />

        <input
          className="g-input"
          placeholder="Link to your work (site, IG, Bandcamp, Drive folder…)"
          value={portfolioUrl}
          onChange={(e) => setPortfolioUrl(e.target.value)}
        />

        <textarea
          className="g-input"
          rows={4}
          placeholder="What would you bring, and why this piece?"
          value={workDescription}
          onChange={(e) => setWorkDescription(e.target.value)}
        />
      </div>

      <div style={{ marginTop: 20 }}>
        <SectionLabel>What do you make?</SectionLabel>
        <p className="g-hint" style={{ marginTop: 6 }}>
          Pick up to {MAX_INTERESTS}. {interests.length}/{MAX_INTERESTS}{" "}
          chosen.
        </p>
        <div
          role="group"
          aria-label="What do you make?"
          style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}
        >
          {INTERESTS.map((interest) => {
            const on = interests.includes(interest);
            return (
              <button
                key={interest}
                type="button"
                aria-pressed={on}
                disabled={!on && atCap}
                onClick={() => toggleInterest(interest)}
                style={chipStyle(on, !on && atCap)}
              >
                {interest}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <SectionLabel>How you'd take part</SectionLabel>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {PARTICIPATION.map((p) => (
            <label
              key={p.value}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                cursor: "pointer",
                fontSize: 15,
              }}
            >
              <input
                type="checkbox"
                checked={participation.includes(p.value)}
                onChange={() => toggle(p.value)}
                style={{ marginTop: 5, accentColor: "var(--g-citron)" }}
              />
              <span>
                <span style={{ color: "var(--g-paper)" }}>{p.label}</span>
                <span className="g-hint" style={{ display: "block", fontSize: 14 }}>
                  {p.note}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <button
        className="g-btn g-btn-citron"
        type="submit"
        disabled={busy}
        style={{ marginTop: 20, opacity: busy ? 0.6 : 1 }}
      >
        {busy ? "Sending…" : "Send application"}
      </button>
      {error && (
        <p style={{ color: "var(--g-citron)", fontSize: 14, marginTop: 10 }}>
          {error}
        </p>
      )}
    </form>
  );

  return (
    <>
      <div className="g-card" id={id} style={{ marginTop: 18 }}>
        {step === "email" ? (
          <form onSubmit={submitEmail}>
            <div className="g-label">Step 1 of 2 — takes 20 seconds</div>
            <p className="g-h" style={{ fontSize: 22, marginTop: 10 }}>
              Apply to show your work.
            </p>
            <p className="g-hint" style={{ marginTop: 8 }}>
              Free. No account. Your email saves first, so you can finish the
              rest whenever.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              <input
                className="g-input"
                style={{ flex: "1 1 240px" }}
                type="email"
                required
                autoComplete="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button
                className="g-btn g-btn-citron"
                type="submit"
                disabled={busy}
                style={{ opacity: busy ? 0.6 : 1 }}
              >
                {busy ? "Saving…" : "Start"}
              </button>
            </div>
            {error && (
              <p style={{ color: "var(--g-citron)", fontSize: 14, marginTop: 10 }}>
                {error}
              </p>
            )}
          </form>
        ) : (
          // The email is banked. This card stays as the way back into the
          // overlay if they dismissed it, and as proof we have their address.
          <div>
            <div className="g-label" style={{ color: "var(--g-citron)" }}>
              {step === "done" ? "Application received" : "Email saved"}
            </div>
            <p className="g-h" style={{ fontSize: 20, marginTop: 10 }}>
              {step === "done"
                ? "We'll be in touch by " + DECISION_BY + "."
                : "You're on the list as " + email + "."}
            </p>
            <p className="g-hint" style={{ marginTop: 8 }}>
              {step === "done"
                ? "Want to change what you sent? Open it again and resubmit."
                : "One more step and the jury has something to read."}
            </p>
            <button
              className="g-btn g-btn-ghost"
              type="button"
              onClick={() => setModalOpen(true)}
              style={{ marginTop: 14 }}
            >
              {step === "done" ? "Review answers" : "Finish application"}
            </button>
          </div>
        )}
      </div>

      {modalOpen && (
        <div
          onClick={() => setModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(8,8,8,0.72)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            onClick={(e) => e.stopPropagation()}
            className="g-card"
            style={{
              background: "var(--g-ink)",
              width: "100%",
              maxWidth: 560,
              // A phone in landscape has ~340px of height to spare; the form
              // has to scroll inside the dialog or the submit button is
              // unreachable.
              maxHeight: "90vh",
              overflow: "auto",
              position: "relative",
            }}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setModalOpen(false)}
              style={{
                position: "absolute",
                top: 10,
                right: 12,
                background: "transparent",
                border: "none",
                color: "var(--g-dim)",
                fontSize: 22,
                lineHeight: 1,
                cursor: "pointer",
                padding: 6,
              }}
            >
              ×
            </button>
            {step === "done" ? doneBody : detailsBody}
          </div>
        </div>
      )}
    </>
  );
}

// ————— Page —————

export default function Showcase() {
  const stats = useQuery(api.showcase.publicStats);

  return (
    <GardenPage>
      <style>{PAGE_CSS}</style>

      {/* Hero */}
      <div style={{ marginTop: 18 }}>
        <span className="g-badge g-badge-citron">Open call</span>
        <h1 className="g-h" style={{ marginTop: 16 }}>
          Show your work on November 6.
        </h1>
        <p
          style={{
            fontSize: 19,
            lineHeight: 1.5,
            marginTop: 16,
            color: "var(--g-paper)",
            maxWidth: "34ch",
          }}
        >
          {SPOTS} Christian creatives. One room in Encinitas. Free to apply.
        </p>

        <img
          src="/showcase/table-drawing.jpg"
          alt="Line drawing of people around a long table making things — playing guitar, throwing pottery, working with tools, reading."
          style={{
            width: "100%",
            marginTop: 28,
            borderRadius: 6,
            filter: "invert(1)",
            display: "block",
          }}
        />
      </div>

      <ApplyForm id="apply" />

      {/* The positioning. Unpaid faith or faithless funding, and a third
          option. Five short sentences, and it does not get longer. */}
      <Section label="Why this exists">
        <p
          className="g-h"
          style={{ fontSize: "clamp(21px,3.6vw,27px)", lineHeight: 1.25 }}
        >
          You keep posting the work and hoping the right people see it.
        </p>
        <P>They don't.</P>
        <P>
          The only two offers you get are unpaid faith or faithless funding.
          The church wants it donated. The gallery wants the faith left out.
        </P>
        <P>
          <span style={{ color: "var(--g-paper)" }}>
            So we made a third one. A room that wants both.
          </span>{" "}
          Everyone in it paid to be there. The work stays up here afterward.
        </P>
      </Section>

      {/* Facts before persuasion — a creative deciding whether to apply is
          scanning for the date, the cost and the catch. */}
      <Section label="The details">
        <FactLine k="When" v={EVENT_DATE} />
        <FactLine k="Where" v={EVENT_PLACE} />
        <FactLine k="Spots" v={`${SPOTS}, selected from applications`} />
        <FactLine k="To apply" v="Free" />
        <FactLine k="Admission" v={TICKET_SUMMARY} />
        <FactLine k="Closes" v={`${CLOSE_DATE}, but selection is rolling`} />
        <FactLine k="Also" v="Livestreamed free, and recorded" />
        {stats?.total != null && (
          <p className="g-hint" style={{ marginTop: 14 }}>
            {stats.total} creatives have applied so far.
          </p>
        )}
      </Section>

      <Section label="Five ways to take part">
        <P>Pick any that fit. Most people pick one.</P>
        <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
          {PARTICIPATION.map((p) => (
            <div
              key={p.value}
              className="g-card"
              style={{ display: "flex", gap: 16, alignItems: "flex-start" }}
            >
              <span
                style={{ color: "var(--g-citron)", flexShrink: 0, marginTop: 2 }}
              >
                <Ink d={PARTICIPATION_INK[p.value]} label={p.label} />
              </span>
              <span>
                <span
                  style={{
                    color: "var(--g-paper)",
                    fontSize: 16.5,
                    display: "block",
                  }}
                >
                  {p.label}
                </span>
                <span className="g-hint" style={{ display: "block", marginTop: 6 }}>
                  {p.note}
                </span>
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* The economy, in the site's own tagline. This sits high on the page
          on purpose: an applicant who finds out at acceptance that they have
          to buy a ticket feels bait-and-switched, and it's a fundraiser, so
          there is no version of this where we hide it. Three lines, because
          three paragraphs is where this section was and nobody read it. */}
      <Section label="Give · Receive · Grow">
        <div style={{ marginBottom: 8 }}>
          <Beat
            word="Give"
            line="Patrons buy a ticket and buy work. That is where the money comes from."
          />
          <Beat
            word="Receive"
            line={`The ${SPOTS} creatives get shown, credited and paid.`}
          />
          <Beat
            word="Grow"
            line="What's left goes into the grant fund, which backs the next projects."
          />
        </div>
        <P>
          So everyone in the room holds a ticket. That includes us, and it
          includes the {SPOTS} people showing work.
        </P>
        <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
          {TICKET_TIERS.map((tier) => (
            <a
              key={tier.label}
              href={TICKET_HREF}
              className="g-card sc-ticket"
              style={{
                display: "flex",
                gap: 16,
                alignItems: "baseline",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <span
                className="g-h"
                style={{ fontSize: 26, color: "var(--g-citron)", flexShrink: 0 }}
              >
                {tier.price}
              </span>
              <span style={{ flex: 1 }}>
                <span style={{ color: "var(--g-paper)", display: "block" }}>
                  {tier.label}
                </span>
                <span className="g-hint" style={{ display: "block", marginTop: 4 }}>
                  {tier.note}
                </span>
              </span>
              <span
                className="g-badge g-badge-line"
                style={{ flexShrink: 0, whiteSpace: "nowrap" }}
              >
                {TICKET_URL ? "Buy" : "Coming soon"}
              </span>
            </a>
          ))}
        </div>
        <P>
          {TICKET_URL
            ? "The room is small. If it sells out, being selected won't get you in."
            : "Tickets aren't on sale yet. Leave your email and you'll get the link before it's public."}
        </P>
        <P>Can't be in Encinitas? The livestream is free.</P>
      </Section>

      <Section label="Who this is for">
        <WhoCard
          who="Apparel"
          ink={INK_SHIRT}
          quote="I'm a designer. I'm not a Jesus-merch guy."
          body={`Your drops go out to a feed that won't show them to anyone who'd wear them. A table is ${TABLE_FEE} and there aren't many. What you sell is yours.`}
        />
        <WhoCard
          who="Painters"
          ink={INK_BRUSH}
          quote="I don't want to be collected for my subject matter."
          body="Galleries won't hang it. The church asks you to donate it. Bring the piece you can't place anywhere."
        />
        <WhoCard
          who="Musicians"
          ink={INK_PLAY}
          quote="I'm not allowed to write anything that isn't a worship song."
          body="Play the songs nobody will program, to a room that came to listen. Sets are paid. Spoken word counts."
        />
        <WhoCard
          who="Photographers"
          ink={INK_CAMERA}
          quote="My portfolio is full of other people's weddings."
          body="Hang your own work, or shoot the night and get credited. Either way the frames stay yours."
        />
        <WhoCard
          who="Patrons"
          ink={INK_HANDS}
          quote="I want to back someone specific, not a cause."
          body="Buy a patron ticket and you'll meet the twenty, see what they made and know where your money went. Buy the piece off the wall if you want it."
        />
      </Section>

      <Section label="Apply">
        <P>
          Applications close {CLOSE_DATE}, and we pick as they come in. The
          earlier you send yours, the more of the {SPOTS} spots are left.
        </P>
        <ApplyForm />
      </Section>

      {/* Below the form on purpose. An FAQ above the ask answers objections
          nobody has yet; below it, it catches the people who scrolled past. */}
      <Section label="Questions people ask">
        <div style={{ display: "grid", gap: 10 }}>
          <Faq q="How does selection work?">
            A few of us read every application and pick {SPOTS}. We care that
            the work is finished and that it's yours. Follower counts don't
            come into it. You don't need an account, a membership or a
            portfolio site. A link to your Instagram grid is a fine
            submission.
          </Faq>
          <Faq q="When do I hear back?">
            We read applications as they arrive rather than waiting for the
            deadline, so applying early means hearing early, and spots do
            fill. You'll hear either way within a few days, and by{" "}
            {DECISION_BY} at the latest. If it's a no, we keep what you sent.
            The next call opens in January.
          </Faq>
          <Faq q="What does it cost?">
            Applying is free and showing work is free. Two things aren't: a
            table is {TABLE_FEE}, and everyone in the room holds a ticket at{" "}
            {TICKET_SUMMARY}, creatives included. It's a fundraiser for the
            grant fund, so nobody goes free, us included.
          </Faq>
          <Faq q="I'm not a creative. Can I come?">
            Yes, and it's the reason the night works. Buy a patron ticket.
            There's nothing to apply for, you just come, meet the twenty
            people showing and buy what you like.
          </Faq>
          <Faq q="Do I have to pay for a membership?">
            No, and applying doesn't sign you up for one.{" "}
            <Link to="/join" style={{ color: "var(--g-citron)" }}>
              Membership
            </Link>{" "}
            is separate and has nothing to do with whether you're selected.
          </Faq>
          <Faq q="Does the work have to be physical?">
            No. The night is a mix of physical and digital. If it's an object
            it has to reach Encinitas by November 6 and we can't cover
            shipping. If it's a screen, a recording or a file, distance stops
            mattering.
          </Faq>
          <Faq q="Does my work have to be religious?">
            No. What we want to platform is redemptive work: work that
            embodies truth, goodness and beauty. Sometimes that includes
            church hurt. Bring the honest thing, not the safe one.
          </Faq>
        </div>
      </Section>
    </GardenPage>
  );
}
