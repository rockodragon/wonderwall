// /showcase — the November 6 open call. This is the destination every piece
// of the Instagram acquisition push points at (docs/marketing/
// showcase-open-call.md), so it is public, prerendered, and readable with
// no account.
//
// The page sells a SHOW, not a membership. A juried open call converts far
// better on cold social traffic than "join our community" does: it has a
// deadline, it confers status, it's free to enter, and the account is the
// byproduct of applying rather than the ask. Membership is mentioned once,
// near the bottom, as what happens after — never as the price of entry. If
// someone edits this page toward "sign up for The Garden," the conversion
// mechanic is gone; keep the call the subject.
//
// The form is two steps for one reason: the email saves on step one, alone,
// before any other question. An abandoned application still leaves a
// contactable person, and the list is the only asset Meta cannot delete.
// convex/showcase.ts's `apply` also writes that email to the waitlist.
//
// The hero drawing is inverted (filter: invert(1)) rather than re-exported:
// it's ink on white paper, and the Garden shell is paper on ink. Inversion
// turns the pen lines into light on dark and costs nothing at build time.

import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
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
// TICKET_PRICE and TICKET_URL are unset until the price is decided. While
// TICKET_URL is null the page still states that admission is ticketed and
// that waiting is a real risk; it just can't sell one yet. Fill both in and
// the CTA appears — nothing else has to change.
const TICKET_PRICE: string | null = null;
const TICKET_URL: string | null = null;

const DISCIPLINES = [
  { value: "apparel", label: "Apparel / textiles" },
  { value: "visual", label: "Painting / illustration" },
  { value: "music", label: "Music / sound" },
  { value: "photography", label: "Photography" },
  { value: "film", label: "Film / video" },
  { value: "writing", label: "Writing / poetry" },
  { value: "spokenword", label: "Spoken word" },
  { value: "design", label: "Design / objects" },
  { value: "other", label: "Something else" },
] as const;

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
    note: "Tables cost a fee and there aren't many. You keep what you sell.",
  },
  {
    value: "document",
    label: "Photograph the night",
    note: "Credited, and your shots stay yours. You still buy a ticket.",
  },
] as const;

type Discipline = (typeof DISCIPLINES)[number]["value"];
type Participation = (typeof PARTICIPATION)[number]["value"];

/** Native <option> doesn't inherit the dark shell — see the select below. */
const OPTION_STYLE = { background: "#121212", color: "#f7f7f4" };

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

function Ink({ d, label }: { d: string; label: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label={label}
      style={{ width: 44, height: 44, display: "block" }}
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

const PARTICIPATION_INK: Record<string, string> = {
  exhibit: INK_FRAME,
  perform: INK_PLAY,
  vend: INK_TABLE,
  document: INK_CAMERA,
};

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

/** One of the four "who this is for" cards. The heading is the creative's
    own sentence about themselves, not our description of them — that's the
    line that makes a stranger stop scrolling and think "that's me." */
function WhoCard({
  quote,
  who,
  body,
}: {
  quote: string;
  who: string;
  body: string;
}) {
  return (
    <div className="g-card" style={{ marginTop: 14 }}>
      <div className="g-label" style={{ color: "var(--g-citron)" }}>{who}</div>
      <p
        className="g-h"
        style={{ fontSize: 19, marginTop: 10, lineHeight: 1.3 }}
      >
        “{quote}”
      </p>
      <p style={{ fontSize: 15.5, lineHeight: 1.6, marginTop: 10 }}>{body}</p>
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

// ————— The form —————

function ApplyForm({ id }: { id?: string }) {
  const apply = useMutation(api.showcase.apply);
  const answer = useMutation(api.showcase.answerApplication);

  const [step, setStep] = useState<"email" | "details" | "done">("email");
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
  const [discipline, setDiscipline] = useState<Discipline | "">("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [workDescription, setWorkDescription] = useState("");
  const [participation, setParticipation] = useState<Participation[]>([]);

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
        discipline: discipline || undefined,
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

  if (step === "done") {
    return (
      <div className="g-card" id={id} style={{ marginTop: 18 }}>
        <div className="g-label" style={{ color: "var(--g-citron)" }}>
          You're in
        </div>
        <p className="g-h" style={{ fontSize: 22, marginTop: 10 }}>
          Application received.
        </p>
        <p style={{ fontSize: 15.5, lineHeight: 1.6, marginTop: 10 }}>
          We read every one as it comes in, so you'll hear back by email
          within a few days — whether or not you're selected, and by{" "}
          {DECISION_BY} at the latest. If you want to add more work before
          then, reply to that email and send it.
        </p>
        <p style={{ fontSize: 15.5, lineHeight: 1.6, marginTop: 12 }}>
          In the meantime,{" "}
          <Link to="/opportunities" style={{ color: "var(--g-citron)" }}>
            see what's being made
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="g-card" id={id} style={{ marginTop: 18 }}>
      {step === "email" ? (
        <form onSubmit={submitEmail}>
          <div className="g-label">Step 1 of 2 — takes 20 seconds</div>
          <p className="g-h" style={{ fontSize: 22, marginTop: 10 }}>
            Apply to show your work.
          </p>
          <p className="g-hint" style={{ marginTop: 8 }}>
            Free. No account needed. Your email saves first so you can finish
            the rest whenever.
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
        <form onSubmit={submitDetails}>
          <div className="g-label">
            {returning ? "You've already applied" : "Step 2 of 2 — tell us about the work"}
          </div>
          <p className="g-hint" style={{ marginTop: 8 }}>
            {returning
              ? `We already have an application for ${email}. Filling this in again replaces it — useful if you'd rather send different work.`
              : `Saved as ${email}. Everything below is optional, but the jury can only go on what you give them.`}
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

            <select
              className="g-input"
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value as Discipline)}
            >
              {/* The shell is dark and .g-input sets color to near-white,
                  which options inherit — without an explicit background
                  they render white-on-white in Firefox and on Windows
                  Chrome. Set both on every option. */}
              <option value="" style={OPTION_STYLE}>
                What do you make?
              </option>
              {DISCIPLINES.map((d) => (
                <option key={d.value} value={d.value} style={OPTION_STYLE}>
                  {d.label}
                </option>
              ))}
            </select>

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
      )}
    </div>
  );
}

// ————— Page —————

export default function Showcase() {
  const stats = useQuery(api.showcase.publicStats);

  return (
    <GardenPage>
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

      {/* The positioning. This is the whole pitch in four sentences and the
          reason the page works — see the marketing doc §1. */}
      <Section label="Why this exists">
        <p
          className="g-h"
          style={{ fontSize: "clamp(21px,3.6vw,27px)", lineHeight: 1.25 }}
        >
          You keep posting the work and hoping the right people see it.
        </p>
        <P>
          They don't. The feed doesn't work like that. And the two rooms that
          will have you each want something cut out first — galleries want the
          faith gone, churches want the invoice gone.
        </P>
        <P>
          So we're making a third room.{" "}
          <span style={{ color: "var(--g-paper)" }}>
            We're the audience you've been posting at.
          </span>{" "}
          One night, a wall, people who came to look. The work stays up here
          afterward.
        </P>
      </Section>

      {/* Facts before persuasion — a creative deciding whether to apply is
          scanning for the date, the cost and the catch. */}
      <Section label="The details">
        <FactLine k="When" v={EVENT_DATE} />
        <FactLine k="Where" v={EVENT_PLACE} />
        <FactLine k="Spots" v={`${SPOTS}, selected from applications`} />
        <FactLine k="To apply" v="Free" />
        <FactLine
          k="Admission"
          v={
            TICKET_PRICE
              ? `${TICKET_PRICE} — everyone, including the creatives showing`
              : "Ticketed — everyone, including the creatives showing"
          }
        />
        <FactLine
          k="Closes"
          v={`${CLOSE_DATE} — but selection is rolling, so apply early`}
        />
        <FactLine k="Also" v="Livestreamed free, and recorded" />
        {stats?.total != null && (
          <p className="g-hint" style={{ marginTop: 14 }}>
            {stats.total} creatives have applied so far.
          </p>
        )}
      </Section>

      <Section label="Four ways to take part">
        <P>
          Pick any that fit. Most people pick one.
        </P>
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

      {/* Admission. This sits high on the page on purpose — an applicant
          who finds out at acceptance that they have to buy a ticket feels
          bait-and-switched, and it's a fundraiser, so there is no version of
          this where we hide it. */}
      <Section label="Getting in">
        <P>
          November 6 is a fundraiser for the grant fund — the money that backs
          creatives' projects. So everyone in the room holds a ticket. That
          includes us, and it includes the {SPOTS} people showing work.
        </P>
        <P>
          The room is small. You can wait and buy later, but if it sells out
          before you do, being selected won't get you in. Buy early if you
          intend to come.
        </P>
        {TICKET_URL ? (
          <a
            className="g-btn g-btn-citron"
            href={TICKET_URL}
            style={{ marginTop: 18 }}
          >
            {TICKET_PRICE ? `Get a ticket — ${TICKET_PRICE}` : "Get a ticket"}
          </a>
        ) : (
          <p className="g-hint" style={{ marginTop: 16 }}>
            Tickets aren't on sale yet. Apply and we'll send you the link
            before they go public.
          </p>
        )}
        <P>
          Can't be in Encinitas? The livestream is free and there's no ticket
          for it.
        </P>
      </Section>

      <Section label="Who this is for">
        <WhoCard
          who="Apparel"
          quote="I'm a designer. I'm not a Jesus-merch guy."
          body="Your drops go out to a feed that won't show them to anyone who'd wear them. Tables are limited and cost a fee, but what you sell is yours."
        />
        <WhoCard
          who="Painters"
          quote="I don't want to be collected for my subject matter."
          body="Galleries won't hang it. The church asks you to donate it. Bring the piece you can't place anywhere."
        />
        <WhoCard
          who="Musicians"
          quote="I'm not allowed to write anything that isn't a worship song."
          body="Play the songs nobody will program, to a room that came to listen instead of sing along. Sets are paid. Spoken word counts."
        />
        <WhoCard
          who="Photographers"
          quote="My portfolio is full of other people's weddings."
          body="Hang your own work, or shoot the night and get credited. Either way the frames stay yours."
        />
      </Section>

      <Section label="How selection works">
        <P>
          A few of us read every application and pick {SPOTS}. We care that
          the work is finished and that it's yours. Follower counts don't
          come into it.
        </P>
        <P>
          You don't need an account, a membership, or a portfolio site. A link
          to your Instagram grid is a fine submission.
        </P>
        <P>
          We read them as they arrive rather than waiting for the deadline, so
          applying early means hearing early — and spots do fill. You'll hear
          either way within a few days, and by {DECISION_BY} at the latest.
        </P>
        <P>
          If it's a no, we keep what you sent. The next call opens in January.
        </P>
      </Section>

      <Section label="Questions people ask">
        <div style={{ display: "grid", gap: 18 }}>
          <div>
            <div style={{ color: "var(--g-paper)", fontSize: 16.5 }}>
              What does it cost?
            </div>
            <P>
              Applying is free, and showing work is free. Two things aren't:
              tables cost a fee, and everyone in the room has a ticket —
              including the creatives showing. It's a fundraiser for the grant
              fund, so nobody goes free, us included.
            </P>
          </div>
          <div>
            <div style={{ color: "var(--g-paper)", fontSize: 16.5 }}>
              Do I have to pay for a membership?
            </div>
            <P>
              No, and applying doesn't sign you up for one.{" "}
              <Link to="/join" style={{ color: "var(--g-citron)" }}>
                Membership
              </Link>{" "}
              is separate and has nothing to do with whether you're selected.
            </P>
          </div>
          <div>
            <div style={{ color: "var(--g-paper)", fontSize: 16.5 }}>
              Does the work have to be physical?
            </div>
            <P>
              No. The night is a mix of physical and digital, and not
              everything has to be in the room. If it's an object, it has to
              reach Encinitas by November 6 and we can't cover shipping. If
              it's a screen, a recording or a file, distance stops mattering —
              tell us what it is and we'll work it out.
            </P>
          </div>
          <div>
            <div style={{ color: "var(--g-paper)", fontSize: 16.5 }}>
              Does my work have to be religious?
            </div>
            <P>
              No. What we want to platform is redemptive work — work that
              embodies truth, goodness and beauty. Sometimes that includes
              church hurt. Bring the honest thing, not the safe one.
            </P>
          </div>
        </div>
      </Section>

      <Section label="Apply">
        <P>
          Applications close {CLOSE_DATE}, but we pick as they come in. The
          earlier you send yours, the more of the {SPOTS} spots are left. Two
          minutes, and the first step is just your email.
        </P>
        <ApplyForm />
      </Section>
    </GardenPage>
  );
}
