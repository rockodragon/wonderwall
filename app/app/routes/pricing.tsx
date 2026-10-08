// /pricing — what each level can do, and what the platform takes
// (docs/features/pricing-page.md). Not linked from anywhere yet, and noindex,
// until Rick approves the new claims it uses (claims.md, "Added 2026-10-03").
//
// Every money sentence is a CLAIM, never written here. The levels are the
// plan's (docs/creatives-exchange-discussion-brief.md §2–3 and its Tables
// update): a free account, a membership in a community, and seats a sponsor
// pays for. Each row in FEATURES was checked against what the server enforces
// on `tables`; the doc lists where the plan, the code and other pages differ.

import { Link } from "react-router";
import { Check, Minus } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { Route } from "./+types/pricing";
import { SiteHeader } from "../components/SiteHeader";
import { CLAIMS } from "../constants/claims";

export function meta(_: Route.MetaArgs) {
  const title = "Pricing | TheCreative.exchange";
  const description = `${CLAIMS.join} ${CLAIMS.perCommunity}`;
  return [
    { title },
    { name: "description", content: description },
    // Off search until it's linked (see the file header).
    { name: "robots", content: "noindex" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
  ];
}

type Level = "free" | "member";
/** true / false, or the level's own amount ("5 a day"). */
type Cell = boolean | string;

/** One list for the cards and the comparison, so they can't disagree. */
const FEATURES: { label: string; free: Cell; member: Cell }[] = [
  { label: "Profile and portfolio", free: true, member: true },
  { label: "Browse people, projects, events and Tables", free: true, member: true },
  { label: "Back a creative or a project", free: true, member: true },
  { label: "Post projects, paid work and events", free: true, member: true },
  { label: "Set a free, one-time Table", free: true, member: true },
  { label: "Join an open paid Table by paying its price", free: true, member: true },
  { label: "Start new conversations", free: "5 a day", member: "50 a day" },
  { label: "Apply to paid work and respond to gigs", free: false, member: true },
  { label: "Ask a grant fund to back your project", free: false, member: true },
  { label: "Charge for a Table, or run one that meets again", free: false, member: true },
  { label: "Join members-only Tables", free: false, member: true },
  { label: "Sell tickets to your events", free: false, member: true },
  { label: "Choose who gets your monthly grant", free: false, member: true },
];

/** A card's list: the level's features, with limits ("50 a day") last so
 *  what you can do leads. */
function cardList(level: Level, keep: (f: (typeof FEATURES)[number]) => boolean): string[] {
  const rows = FEATURES.filter(keep);
  const limits = rows.filter((f) => typeof f[level] === "string");
  return [
    ...rows.filter((f) => typeof f[level] !== "string").map((f) => f.label),
    ...limits.map((f) => `${f.label}: ${f[level]}`),
  ];
}

const FREE_LIST = cardList("free", (f) => f.free !== false);
// A member gets everything above; the card lists only what's added or more.
const MEMBER_LIST = cardList("member", (f) => f.free !== f.member);

const SPONSOR_LIST = [
  "As many seats as you want",
  "A code for each person you cover",
  "Each code makes them a full member",
];

/** What the platform takes, by kind of money. Claims only. */
const TAKES: { what: string; says: string[] }[] = [
  { what: "Membership", says: [CLAIMS.dues, CLAIMS.duesOtherHalf] },
  { what: "Backing", says: [CLAIMS.backingShort, CLAIMS.largeGift, CLAIMS.processingFee] },
  { what: "Paid Tables", says: [CLAIMS.tableSplit, CLAIMS.tableProcessingFee] },
  { what: "Paying someone directly", says: [CLAIMS.directPay] },
];

const QUESTIONS: { q: string; a: string }[] = [
  { q: "Do I pay every community I join?", a: CLAIMS.perCommunity },
  { q: "What does a membership get me?", a: CLAIMS.membership },
  { q: "Can I host without paying?", a: `${CLAIMS.tablesFree} ${CLAIMS.tablesPaid} ${CLAIMS.tablesJoinPaid}` },
  { q: "Can I sell tickets?", a: CLAIMS.tickets },
  { q: "What if a church or patron covers me?", a: CLAIMS.coverage },
  { q: "Where do grants come from?", a: `${CLAIMS.pool} ${CLAIMS.memberDirected}` },
];

const CTA_PRIMARY =
  "inline-flex items-center justify-center px-5 py-3 rounded-xl text-[13.5px] font-semibold bg-[var(--garden-citron)] text-[var(--garden-ink)] hover:opacity-90 transition-opacity";
const CTA_SECONDARY =
  "inline-flex items-center justify-center px-5 py-3 rounded-xl text-[13.5px] font-semibold border border-[var(--garden-hairline-raised)] text-[var(--garden-paper)] hover:border-[var(--garden-citron)] transition-colors";
const EYEBROW = "text-[12px] font-semibold tracking-[0.14em] uppercase text-[var(--garden-dim)]";

export default function Pricing() {
  return (
    <div className="min-h-screen bg-[var(--garden-ink)]">
      <link rel="stylesheet" href="/tokens.css" />
      <SiteHeader />

      <main className="px-4 sm:px-6 pt-8 pb-24 max-w-[1100px] mx-auto">
        <p className={EYEBROW}>Pricing</p>
        <h1
          className="mt-3 text-4xl md:text-6xl font-bold leading-tight text-[var(--garden-paper)]"
          style={{ fontFamily: "var(--garden-font-display)" }}
        >
          {CLAIMS.join}
        </h1>
        <p className="mt-4 text-lg text-[var(--garden-body)] max-w-2xl">{CLAIMS.perCommunity}</p>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          <Plan
            name="Free account"
            forWho="For everyone"
            price="$0"
            cta={{ to: "/signup", label: "Create an account" }}
            items={FREE_LIST}
          />
          <Plan
            name="Member"
            eyebrow="The Garden"
            forWho="For creatives who want paid work and backing"
            price="$10"
            per="a month"
            cta={{ to: "/join", label: "Become a member" }}
            lead="Everything in Free, plus:"
            items={MEMBER_LIST}
            note={CLAIMS.dues}
            featured
          />
          <Plan
            name="Sponsor seats"
            forWho="For churches, businesses and patrons"
            price="$10"
            per="a seat, a month"
            cta={{ to: "/coverage", label: "Sponsor seats" }}
            items={SPONSOR_LIST}
            note={CLAIMS.coverage}
          />
        </div>

        <section className="mt-20" aria-labelledby="takes">
          <h2 id="takes" className="text-2xl font-semibold text-[var(--garden-paper)]">
            What we take
          </h2>
          <dl className="mt-6 divide-y divide-[var(--garden-hairline)] border-y border-[var(--garden-hairline)]">
            {TAKES.map((t) => (
              <div key={t.what} className="py-4 grid gap-1 sm:grid-cols-[220px_1fr] sm:gap-6">
                <dt className="text-[15px] font-semibold text-[var(--garden-paper)]">{t.what}</dt>
                <dd className="text-[15px] leading-relaxed text-[var(--garden-body)]">{t.says.join(" ")}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-20" aria-labelledby="compare">
          <h2 id="compare" className="text-2xl font-semibold text-[var(--garden-paper)]">
            Compare
          </h2>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--garden-hairline)]">
            <table className="w-full min-w-[480px] text-left text-[15px]">
              <thead>
                <tr className="border-b border-[var(--garden-hairline)]">
                  <th scope="col" className="py-3 px-4 font-semibold text-[var(--garden-dim)]">
                    <span className="sr-only">What you can do</span>
                  </th>
                  <th scope="col" className="py-3 px-4 w-[120px] font-semibold text-[var(--garden-paper)]">Free</th>
                  <th scope="col" className="py-3 px-4 w-[120px] font-semibold text-[var(--garden-paper)]">Member</th>
                </tr>
              </thead>
              <tbody>
                {FEATURES.map((f) => (
                  <tr key={f.label} className="border-b border-[var(--garden-hairline)] last:border-0">
                    <th scope="row" className="py-3 px-4 font-normal text-[var(--garden-body)]">{f.label}</th>
                    <td className="py-3 px-4"><Mark cell={f.free} /></td>
                    <td className="py-3 px-4"><Mark cell={f.member} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-20 max-w-3xl" aria-labelledby="questions">
          <h2 id="questions" className="text-2xl font-semibold text-[var(--garden-paper)]">
            Questions
          </h2>
          <div className="mt-6 divide-y divide-[var(--garden-hairline)] border-y border-[var(--garden-hairline)]">
            {QUESTIONS.map((x) => (
              <details key={x.q} className="group py-4">
                <summary className="cursor-pointer list-none flex items-center justify-between gap-4 text-[15px] font-semibold text-[var(--garden-paper)]">
                  {x.q}
                  <span aria-hidden className="text-[var(--garden-dim)] transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-[15px] leading-relaxed text-[var(--garden-body)]">{x.a}</p>
              </details>
            ))}
          </div>
        </section>

        <div className="mt-16 flex flex-col sm:flex-row gap-3">
          <Link to="/signup" className={CTA_PRIMARY}>Create an account</Link>
          <Link to="/join" className={CTA_SECONDARY}>Become a member</Link>
        </div>
      </main>
    </div>
  );
}

function Plan({
  name,
  eyebrow,
  forWho,
  price,
  per,
  cta,
  lead,
  items,
  note,
  featured = false,
}: {
  name: string;
  eyebrow?: string;
  forWho: string;
  price: string;
  per?: string;
  cta: { to: string; label: string };
  lead?: string;
  items: string[];
  note?: string;
  featured?: boolean;
}) {
  return (
    <div
      className={`flex flex-col rounded-2xl border p-6 ${
        featured
          ? "border-[var(--garden-citron)] bg-[var(--garden-ink-raised)]"
          : "border-[var(--garden-hairline-raised)] bg-[var(--garden-ink-raised)]/60"
      }`}
    >
      <p className={EYEBROW}>{eyebrow ?? " "}</p>
      <h2 className="mt-2 text-xl font-semibold text-[var(--garden-paper)]">{name}</h2>
      <p className="mt-1 text-[15px] text-[var(--garden-body)]">{forWho}</p>
      <p className="mt-6 flex items-baseline gap-2">
        <span className="text-5xl font-bold text-[var(--garden-paper)]" style={{ fontFamily: "var(--garden-font-display)" }}>
          {price}
        </span>
        {per && <span className="text-[15px] text-[var(--garden-muted)]">{per}</span>}
      </p>
      <Link to={cta.to} className={`mt-6 ${featured ? CTA_PRIMARY : CTA_SECONDARY}`}>
        {cta.label}
      </Link>
      {lead && <p className="mt-6 text-[13.5px] font-semibold text-[var(--garden-muted)]">{lead}</p>}
      <ul className={`${lead ? "mt-3" : "mt-6"} space-y-2.5`}>
        {items.map((item) => (
          <li key={item} className="flex gap-2.5 text-[15px] leading-snug text-[var(--garden-body)]">
            <Check aria-hidden size={18} weight="bold" className="mt-0.5 shrink-0 text-[var(--garden-citron)]" />
            {item}
          </li>
        ))}
      </ul>
      {note && <p className="mt-auto pt-6 text-[13.5px] leading-relaxed text-[var(--garden-muted)]">{note}</p>}
    </div>
  );
}

function Mark({ cell }: { cell: Cell }): ReactNode {
  if (typeof cell === "string") return <span className="text-[var(--garden-paper)]">{cell}</span>;
  return cell ? (
    <Check size={18} weight="bold" className="text-[var(--garden-citron)]" aria-label="Yes" />
  ) : (
    <Minus size={18} className="text-[var(--garden-dim)]" aria-label="No" />
  );
}
