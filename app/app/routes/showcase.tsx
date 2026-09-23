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

const DISCIPLINES = [
  { value: "apparel", label: "Apparel / textiles" },
  { value: "visual", label: "Painting / illustration" },
  { value: "music", label: "Music / sound" },
  { value: "photography", label: "Photography" },
  { value: "film", label: "Film / video" },
  { value: "writing", label: "Writing / poetry" },
  { value: "design", label: "Design / objects" },
  { value: "other", label: "Something else" },
] as const;

const PARTICIPATION = [
  {
    value: "exhibit",
    label: "Hang or display work",
    note: "Wall space and plinths. The default for most people.",
  },
  {
    value: "perform",
    label: "Play a set",
    note: "20 minutes. These slots are paid.",
  },
  {
    value: "vend",
    label: "Sell at a table",
    note: "A table is free. You keep everything you make.",
  },
  {
    value: "document",
    label: "Photograph the night",
    note: "Free pass, full credit, your shots stay yours.",
  },
] as const;

type Discipline = (typeof DISCIPLINES)[number]["value"];
type Participation = (typeof PARTICIPATION)[number]["value"];

/** Native <option> doesn't inherit the dark shell — see the select below. */
const OPTION_STYLE = { background: "#121212", color: "#f7f7f4" };

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
          {SPOTS} Christian creatives. One room in Encinitas. Free to apply,
          free to show.
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
          You have been posting your work and waiting for it to reach the
          people it was made for.
        </p>
        <P>
          That is the whole problem. Not your craft — your distribution. The
          feed will not hand your work to the people who would actually want
          it, and the two rooms available to you both ask you to cut something
          off: the gallery wants the faith out of it, the church wants it for
          free.
        </P>
        <P>
          <span style={{ color: "var(--g-paper)" }}>
            We are the target audience.
          </span>{" "}
          That's the entire offer. A room of people who came specifically to
          see what you made, and a platform underneath it where the work keeps
          being visible after everyone goes home.
        </P>
      </Section>

      {/* Facts before persuasion — a creative deciding whether to apply is
          scanning for the date, the cost and the catch. */}
      <Section label="The details">
        <FactLine k="When" v={EVENT_DATE} />
        <FactLine k="Where" v={EVENT_PLACE} />
        <FactLine k="Spots" v={`${SPOTS}, selected from applications`} />
        <FactLine k="Cost" v="Nothing, to apply or to show" />
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
          Pick any that fit — most people pick one, some pick two. There is no
          fee for any of them.
        </P>
        <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
          {PARTICIPATION.map((p) => (
            <div key={p.value} className="g-card">
              <div style={{ color: "var(--g-paper)", fontSize: 16.5 }}>
                {p.label}
              </div>
              <div className="g-hint" style={{ marginTop: 6 }}>
                {p.note}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section label="Who this is for">
        <WhoCard
          who="Apparel"
          quote="I'm a designer. I'm not a Jesus-merch guy."
          body="You've been carrying inventory on a card and posting drops into a feed that won't show them to anyone who'd wear them. Take a table. Keep everything you sell."
        />
        <WhoCard
          who="Painters"
          quote="I don't want to be collected for my subject matter."
          body="The gallery won't hang it and the church wants it donated. Bring the piece you can't place. The wall is yours for the night and it costs you nothing."
        />
        <WhoCard
          who="Musicians"
          quote="I'm not allowed to write anything that isn't a worship song."
          body="Play the songs nobody will program, for a room that came to listen rather than sing along. The performance slots are paid."
        />
        <WhoCard
          who="Photographers"
          quote="My portfolio is full of other people's weddings."
          body="Two ways in: hang your own personal work, or shoot the night with a free pass and full credit. Your frames stay yours either way."
        />
      </Section>

      <Section label="How selection works">
        <P>
          A small group reads every application and picks {SPOTS}. We're
          looking for work that's actually made — finished, specific, yours.
          Not follower counts, not a résumé, not how long you've been at it.
        </P>
        <P>
          You do not need an account, a membership, or a portfolio site to
          apply. A link to an Instagram grid is a perfectly good submission.
        </P>
        <P>
          Selection is rolling: we read applications as they arrive rather
          than waiting for the deadline, so applying early means hearing back
          early — and spots do fill. Everyone hears either way within a few
          days, and by {DECISION_BY} at the latest.
        </P>
        <P>
          A no on this one is not a no forever — the next call opens in
          January, and we keep the work you sent.
        </P>
      </Section>

      <Section label="Questions people ask">
        <div style={{ display: "grid", gap: 18 }}>
          <div>
            <div style={{ color: "var(--g-paper)", fontSize: 16.5 }}>
              Is there a fee?
            </div>
            <P>
              No. Not to apply, not to show, not to sell. If you take a table,
              what you make is yours.
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
              is a separate thing you can look at later or never — half of it
              funds other creatives' projects, which is worth reading about,
              but it has nothing to do with whether you're selected.
            </P>
          </div>
          <div>
            <div style={{ color: "var(--g-paper)", fontSize: 16.5 }}>
              I'm not local. Can I still apply?
            </div>
            <P>
              Yes, but the work has to physically get to Encinitas for
              November 6, and we can't cover shipping or travel. Musicians and
              photographers: tell us where you are and we'll be honest about
              whether it can work.
            </P>
          </div>
          <div>
            <div style={{ color: "var(--g-paper)", fontSize: 16.5 }}>
              Does my work have to be religious?
            </div>
            <P>
              No. Bring the best thing you've made. Some of it will be about
              faith directly and most of it won't, which is how it should be.
            </P>
          </div>
        </div>
      </Section>

      <Section label="Apply">
        <P>
          Applications close {CLOSE_DATE}, but we select as they come in — so
          the earlier you send it, the more of the {SPOTS} spots are still
          open. It takes about two minutes and the first step is just your
          email.
        </P>
        <ApplyForm />
      </Section>
    </GardenPage>
  );
}
