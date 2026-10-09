// /docs/tickets — how to sell tickets or take RSVPs on an event: tickets on
// this site, a PayPal pay link, a Stripe Payment Link, any other link.
// Public (_app.tsx lists "/docs" as a public path), inside the app shell like
// /about. Written for event hosts; the event form's Tickets row links here.
//
// Every fact on this page comes from code. Keep it in step with:
//   garden/ticketLink.ts   what counts as a PayPal or Stripe link
//   lib/eventCta.ts        what the event page shows for each
//   garden/eventRsvps.ts   startPayPalTicket, ticketCommunityJoin, claimTicketBySession
//   garden/apGifts.ts      the Stripe webhook (Abiding Practice's account only)
//   garden/stripe.ts + garden/stripeHandlers.ts   tickets sold on this site
//   docs/features/event-capacity-waitlist.md      the limit and the waitlist
// No money claims here: those come from constants/claims.ts only.

import type { CSSProperties, ReactNode } from "react";
import { LEGAL_ENTITY } from "../legal/entity";
import { AboutShell } from "./about";

export function meta() {
  const description =
    "Sell tickets on this site, or paste a PayPal pay link or a Stripe Payment Link into your event. What each one does, what it supports, and how buyers reach your guest list and your community.";
  return [
    { title: "Tickets and payment links — TheCreative.exchange" },
    { name: "description", content: description },
    { property: "og:title", content: "Tickets and payment links" },
    { property: "og:description", content: description },
  ];
}

// ——— Type ———

const BODY_SIZE = 17;

const h1Style: CSSProperties = {
  color: "var(--garden-paper)",
  fontFamily: "var(--garden-font-display)",
  fontSize: "clamp(34px, 6vw, 52px)",
  lineHeight: 1.08,
  margin: 0,
};

const ledeStyle: CSSProperties = {
  color: "var(--garden-body)",
  fontSize: 18,
  lineHeight: 1.6,
  margin: "18px 0 0",
};

const textStyle: CSSProperties = {
  color: "var(--garden-body)",
  fontSize: BODY_SIZE,
  lineHeight: 1.6,
  margin: "14px 0 0",
};

const listStyle: CSSProperties = { margin: "14px 0 0", paddingLeft: 22 };
const itemStyle: CSSProperties = { color: "var(--garden-body)", fontSize: BODY_SIZE, lineHeight: 1.55 };

const linkStyle: CSSProperties = {
  color: "var(--garden-paper)",
  textDecoration: "underline",
  textUnderlineOffset: 3,
};

function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      style={{
        color: "var(--garden-paper)",
        fontFamily: "var(--garden-font-display)",
        fontSize: 28,
        lineHeight: 1.2,
        margin: "56px 0 0",
        scrollMarginTop: 24,
      }}
    >
      {children}
    </h2>
  );
}

function H3({ children }: { children: ReactNode }) {
  return (
    <h3
      style={{
        color: "var(--garden-paper)",
        fontSize: 19,
        fontWeight: 600,
        lineHeight: 1.3,
        margin: "28px 0 0",
      }}
    >
      {children}
    </h3>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p style={textStyle}>{children}</p>;
}

/** A word from the product's own screens: a button, a label, a status. */
function B({ children }: { children: ReactNode }) {
  return <strong style={{ color: "var(--garden-paper)", fontWeight: 600 }}>{children}</strong>;
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code
      style={{
        color: "var(--garden-paper)",
        fontFamily: "var(--garden-font-mono)",
        fontSize: 14.5,
        backgroundColor: "var(--garden-ink-raised)",
        border: "1px solid var(--garden-hairline-raised)",
        borderRadius: 6,
        padding: "1px 6px",
        overflowWrap: "anywhere",
      }}
    >
      {children}
    </code>
  );
}

function Bullets({ children }: { children: ReactNode }) {
  return (
    <ul className="flex flex-col gap-2.5" style={{ ...listStyle, listStyle: "disc" }}>
      {children}
    </ul>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return (
    <ol className="flex flex-col gap-2.5" style={{ ...listStyle, listStyle: "decimal" }}>
      {children}
    </ol>
  );
}

function Li({ children }: { children: ReactNode }) {
  return <li style={itemStyle}>{children}</li>;
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-xl"
      style={{
        backgroundColor: "var(--garden-ink-raised)",
        border: "1px solid var(--garden-hairline-raised)",
        borderLeft: "3px solid var(--garden-citron)",
        padding: "16px 18px",
        margin: "20px 0 0",
      }}
    >
      {children}
    </div>
  );
}

// ——— What each one supports ———

const SUPPORT_COLUMNS = ["On this site", "PayPal", "Stripe"] as const;

const SUPPORT_ROWS: { label: string; values: [string, string, string] }[] = [
  { label: "On your guest list", values: ["Yes", "Yes", "Yes"] },
  { label: "Joins your community", values: ["If signed in when they buy", "Yes, at Get tickets", "Yes, once they have an account"] },
  { label: "We know they paid", values: ["Yes", "No. Check PayPal", "Yes"] },
  { label: "Pay without an account", values: ["Yes", "No. Free account first", "Yes"] },
  { label: "Event limit enforced", values: ["Yes", "At Get tickets only", "No"] },
  { label: "Waitlist", values: ["Free RSVP only", "Yes", "No"] },
  { label: "More than one ticket", values: ["One per purchase", "Set in PayPal. We count one", "Yes. Count shown"] },
  { label: "Refunds", values: ["Ask us", "In PayPal", "In Stripe"] },
];

function SupportList() {
  return (
    <dl style={{ margin: "20px 0 0", borderBottom: "1px solid var(--garden-hairline-raised)" }}>
      {SUPPORT_ROWS.map((row) => (
        <div key={row.label} style={{ borderTop: "1px solid var(--garden-hairline-raised)", padding: "14px 0" }}>
          <dt style={{ color: "var(--garden-paper)", fontSize: 16, fontWeight: 600, margin: 0 }}>{row.label}</dt>
          <dd
            style={{
              margin: "8px 0 0",
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            {SUPPORT_COLUMNS.map((column, i) => (
              <div key={column} style={{ minWidth: 0 }}>
                <span style={{ display: "block", color: "var(--garden-dim)", fontSize: 13 }}>{column}</span>
                <span style={{ display: "block", color: "var(--garden-body)", fontSize: 15, lineHeight: 1.4 }}>
                  {row.values[i]}
                </span>
              </div>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ——— The page ———

export default function DocsTickets() {
  const contact = LEGAL_ENTITY.contactEmail;

  return (
    <AboutShell>
      <h1 style={h1Style}>
        Tickets and <span style={{ color: "var(--garden-citron)" }}>payment links.</span>
      </h1>
      <p style={ledeStyle}>
        Sell tickets on this site, or paste your own PayPal or Stripe link into your event. Here is what each one
        does.
      </p>

      <H2 id="ways">Ways to sell or take RSVPs</H2>
      <Bullets>
        <Li>
          <B>Tickets on this site.</B> Add ticket tiers to the event. Buyers pay on Stripe Checkout. No account needed.
        </Li>
        <Li>
          <B>A PayPal pay link.</B> We save buyers to your guest list, then send them to your PayPal.
        </Li>
        <Li>
          <B>A Stripe Payment Link.</B> Stripe tells us who paid, and they go on your guest list. Connected today for
          Abiding Practice's Stripe account only.
        </Li>
        <Li>
          <B>Any other link.</B> Eventbrite, Partiful, your own site. People go there and nothing comes back. They
          are not on your guest list.
        </Li>
      </Bullets>
      <P>
        PayPal, Stripe and other links go in the event form's Tickets row, in <B>Tickets or RSVP on another site</B>.
      </P>

      <H2 id="paypal">PayPal: set it up</H2>
      <Steps>
        <Li>
          In PayPal, create a pay link (Pay links and buttons). It looks like <Code>paypal.com/ncp/payment/…</Code>
        </Li>
        <Li>
          In the Tickets row, paste it into <B>Tickets or RSVP on another site</B>.
        </Li>
        <Li>
          Set <B>Price shown ($)</B>. The event page displays it. PayPal charges what the link says.
        </Li>
        <Li>Post the event into your community, so buyers can join it.</Li>
      </Steps>
      <P>
        <B>Recommended.</B> In PayPal, add a required customer note: "Email you registered with". PayPal sends us
        nothing, so the note is how you match PayPal sales to your guest list.
      </P>
      <P>
        <B>Optional.</B> Set a maximum quantity on the link.
      </P>
      <P>
        Only pay links in the <Code>paypal.com/ncp/payment/…</Code> form get this. Any other PayPal link works as a
        plain link out.
      </P>

      <H2 id="paypal-flow">PayPal: what happens</H2>
      <Bullets>
        <Li>
          Buyers press <B>Get tickets</B>. We save their name and email to your guest list first, then send them to
          PayPal.
        </Li>
        <Li>Signed out? They make a free account on the way. We email them a code.</Li>
        <Li>The money goes straight to your PayPal. We never touch it.</Li>
        <Li>
          Your guest list marks them <B>Sent to PayPal</B>. We can't see whether they paid. Check your PayPal
          activity.
        </Li>
        <Li>
          When they come back to the event page, it says <B>You're on the list</B>, with a <B>Pay on PayPal</B> button.
        </Li>
        <Li>
          If the event is in a community, they join it too. See{" "}
          <a href="#community" style={linkStyle}>
            Getting people into your community
          </a>
          .
        </Li>
      </Bullets>

      <H2 id="stripe">Stripe Payment Link</H2>
      <Note>
        <p style={{ color: "var(--garden-paper)", fontSize: BODY_SIZE, fontWeight: 600, lineHeight: 1.5, margin: 0 }}>
          Connected today: Abiding Practice's Stripe account only.
        </p>
        <p style={{ ...textStyle, margin: "8px 0 0" }}>
          A link from any other Stripe account opens fine, but nothing comes back. Buyers do not reach your guest
          list. To connect yours, email{" "}
          <a href={`mailto:${contact}`} style={linkStyle}>
            {contact}
          </a>
          . Until then, check Stripe for who paid, and leave out the redirect in step 3. The event page would promise
          a ticket that never shows up.
        </p>
      </Note>

      <H3>Set it up</H3>
      <Steps>
        <Li>
          In Stripe, create a Payment Link. It looks like <Code>buy.stripe.com/…</Code>
        </Li>
        <Li>
          Paste it into <B>Tickets or RSVP on another site</B>. Set <B>Price shown ($)</B> to the price of one ticket.
          We work out how many tickets someone bought from what they paid.
        </Li>
        <Li>
          In the link's After payment settings, send buyers back to your event page. Stripe fills in the session.
          <span
            style={{
              display: "block",
              margin: "10px 0 0",
              padding: "10px 12px",
              color: "var(--garden-paper)",
              fontFamily: "var(--garden-font-mono)",
              fontSize: 14.5,
              lineHeight: 1.5,
              backgroundColor: "var(--garden-ink-raised)",
              border: "1px solid var(--garden-hairline-raised)",
              borderRadius: 8,
              overflowWrap: "anywhere",
            }}
          >
            {"<your event page address>"}?paid=1&amp;session={"{CHECKOUT_SESSION_ID}"}
          </span>
          <span style={{ display: "block", margin: "10px 0 0" }}>
            Without it, buyers still reach your guest list, but Stripe does not send them back to the event.
          </span>
        </Li>
      </Steps>
      <P>
        <B>Optional.</B> Let buyers choose a quantity. Add one text box for the other guests' names. It shows on your
        guest list.
      </P>

      <H3>What happens</H3>
      <Bullets>
        <Li>
          Buyers press <B>Buy tickets</B> and pay on Stripe. They do not need an account.
        </Li>
        <Li>Stripe tells us. They go on your guest list as paid, with a ticket count and any guest names.</Li>
        <Li>
          With the redirect, Stripe sends them back to the event page, which says <B>You're in</B>.
        </Li>
        <Li>No account yet? We email them, and the event page offers to make one. The ticket moves onto it.</Li>
        <Li>
          They join your community: right away if they were signed in, or once they make their account. See{" "}
          <a href="#community" style={linkStyle}>
            below
          </a>
          .
        </Li>
      </Bullets>

      <H2 id="supports">What each one supports</H2>
      <SupportList />
      <P>Any other link supports none of this. People go to that site, and nothing comes back.</P>
      <P>Refunds are made in the payment provider's own dashboard. They do not change your guest list.</P>

      <H2 id="limit">Event limit and waitlist</H2>
      <P>
        Set a <B>Limit</B> in the event form, next to Tickets. We count the people on your list. PayPal and Stripe sell from their own
        stock, so we cannot stop a sale there. Set the same limit in PayPal or Stripe too.
      </P>
      <Bullets>
        <Li>
          <B>On this site.</B> Sales stop at the limit. Each ticket tier can also have its own quantity.
        </Li>
        <Li>
          <B>PayPal.</B> <B>Get tickets</B> stops at the limit, and people can <B>Join the waitlist</B>. Someone who
          pays straight from your PayPal link is not stopped.
        </Li>
        <Li>
          <B>Stripe.</B> Nothing stops a sale. Buyers count toward the limit, but <B>Buy tickets</B> stays open.
        </Li>
      </Bullets>
      <P>
        You let people in from the waitlist: Guests tab, Waitlist filter, <B>Let in</B>. Nothing moves up on its own.
        On a PayPal event, someone you let in sees <B>Pay on PayPal</B>.
      </P>
      <P>
        <B>Show the address only to people going</B> hides the street address from everyone else. They see the city.
      </P>
      <P>
        Guests who press <B>Can't make it</B> leave your list and free a spot. You get a note. Paid tickets, on this
        site or Stripe, are not cancelled there. The guest asks you.
      </P>

      <H2 id="community">Getting people into your community</H2>
      <P>
        The event has to be posted into your community. Every ticket button shows a line saying that getting tickets
        joins the community and agrees to its agreements, so buyers know before they pay.
      </P>
      <Bullets>
        <Li>
          <B>PayPal.</B> At <B>Get tickets</B>. Signed-out buyers make a free account first.
        </Li>
        <Li>
          <B>Stripe.</B> Signed in when they buy: as soon as Stripe confirms the payment. Signed out: we email them to
          make a free account, and they join when they do.
        </Li>
        <Li>
          <B>On this site.</B> Signed in when they buy: as soon as the payment goes through. Signed out: they get
          their ticket by email and stay on your guest list only.
        </Li>
        <Li>
          <B>Any other link.</B> Nothing comes back.
        </Li>
      </Bullets>
      <P>
        A community that approves new members gets a join request instead. In an invite-only community, buyers stay
        on your guest list but are not joined.
      </P>

      <p
        style={{
          color: "var(--garden-paper)",
          fontFamily: "var(--garden-font-display)",
          fontSize: 22,
          lineHeight: 1.35,
          margin: "56px 0 0",
        }}
      >
        Questions? Email{" "}
        <a href={`mailto:${contact}`} style={{ color: "var(--garden-citron)", textDecoration: "underline", textUnderlineOffset: 4 }}>
          {contact}
        </a>
        .
      </p>
    </AboutShell>
  );
}
