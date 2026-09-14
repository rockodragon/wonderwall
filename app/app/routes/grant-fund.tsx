// /grant-fund — the public explainer for how money flows on this platform.
//
// Two financial lanes (money-words rule, docs/the-exchange-v1-prd.md):
//   Lane 1: Direct backing — platform Stripe, 90/10 split, NOT tax-deductible.
//           Words: "back", "fund", "add to". NEVER "donate" or "gift".
//   Lane 2: The Grant Fund — through Abiding Practice 501(c)(3).
//           Tax-deductible. Words: "donate", "gift" ARE appropriate here.
//
// This page is public marketing, outside the _app layout. Prerendered for
// crawlers and link unfurlers.

import { Link } from "react-router";
import { GardenPage, SectionLabel } from "../garden/ui";
import "../garden/garden.css";

export function meta() {
  return [
    { title: "How Money Works — creatives.exchange" },
    { name: "description", content: "Two ways to put money behind creative work: back a project directly, or donate to the Grant Fund through Abiding Practice, a 501(c)(3)." },
  ];
}

export default function GrantFundPage() {
  return (
    <GardenPage>
      <div style={{ paddingTop: 48, paddingBottom: 80 }}>
        <h1
          className="text-3xl sm:text-4xl font-bold mb-3"
          style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
        >
          How Money Works
        </h1>
        <p
          className="text-lg mb-12 leading-relaxed"
          style={{ color: "var(--garden-body)" }}
        >
          There are two ways to put money behind creative work here.
          They serve different purposes, and one of them is tax-deductible.
        </p>

        {/* Lane 1 — Direct Backing */}
        <section className="mb-14">
          <SectionLabel>Lane 1</SectionLabel>
          <h2
            className="text-2xl font-bold mt-2 mb-4"
            style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
          >
            Back a project directly
          </h2>
          <div
            className="rounded-xl border p-6 mb-4"
            style={{ borderColor: "var(--garden-hairline)", backgroundColor: "var(--garden-ink-raised)" }}
          >
            <dl className="flex flex-col gap-5">
              <div>
                <dt
                  className="text-xs uppercase tracking-[0.06em] mb-1"
                  style={{ color: "var(--garden-dim)", fontFamily: "var(--garden-font-mono)" }}
                >
                  How it works
                </dt>
                <dd style={{ color: "var(--garden-body)" }}>
                  You pick a project and back it — once, monthly, or annually.
                  The creative gets 90% of what you give. The other 10% keeps
                  the platform running and funds the grant program.
                </dd>
              </div>
              <div>
                <dt
                  className="text-xs uppercase tracking-[0.06em] mb-1"
                  style={{ color: "var(--garden-dim)", fontFamily: "var(--garden-font-mono)" }}
                >
                  Where the money goes
                </dt>
                <dd style={{ color: "var(--garden-body)" }}>
                  Directly to the creative, through the platform&apos;s Stripe account.
                  The 10% platform share is split between operating costs and the
                  grant pool — half keeps the lights on, half funds other creatives.
                </dd>
              </div>
              <div>
                <dt
                  className="text-xs uppercase tracking-[0.06em] mb-1"
                  style={{ color: "var(--garden-dim)", fontFamily: "var(--garden-font-mono)" }}
                >
                  Tax status
                </dt>
                <dd style={{ color: "var(--garden-body)" }}>
                  <strong style={{ color: "var(--garden-paper)" }}>Not tax-deductible.</strong>{" "}
                  This is a direct payment to a creative for their work.
                </dd>
              </div>
            </dl>
          </div>
          <Link
            to="/projects"
            className="inline-block px-5 py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
          >
            Browse projects
          </Link>
        </section>

        {/* Lane 2 — The Grant Fund */}
        <section className="mb-14">
          <SectionLabel>Lane 2</SectionLabel>
          <h2
            className="text-2xl font-bold mt-2 mb-4"
            style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
          >
            Donate to the Grant Fund
          </h2>
          <div
            className="rounded-xl border p-6 mb-4"
            style={{ borderColor: "var(--garden-hairline)", backgroundColor: "var(--garden-ink-raised)" }}
          >
            <dl className="flex flex-col gap-5">
              <div>
                <dt
                  className="text-xs uppercase tracking-[0.06em] mb-1"
                  style={{ color: "var(--garden-dim)", fontFamily: "var(--garden-font-mono)" }}
                >
                  How it works
                </dt>
                <dd style={{ color: "var(--garden-body)" }}>
                  The Grant Fund is managed by{" "}
                  <strong style={{ color: "var(--garden-paper)" }}>Abiding Practice</strong>,
                  a registered 501(c)(3) nonprofit.
                  Creatives on the platform propose projects, and the fund awards
                  grants to the ones that serve its mission. Every grant is posted
                  publicly on the fund ledger — anyone can see who got what.
                </dd>
              </div>
              <div>
                <dt
                  className="text-xs uppercase tracking-[0.06em] mb-1"
                  style={{ color: "var(--garden-dim)", fontFamily: "var(--garden-font-mono)" }}
                >
                  Where the money goes
                </dt>
                <dd style={{ color: "var(--garden-body)" }}>
                  Donations go to Abiding Practice&apos;s own bank account through
                  their own payment processor, not through the platform.
                  They decide how to distribute grants, and the public ledger
                  records every movement.
                </dd>
              </div>
              <div>
                <dt
                  className="text-xs uppercase tracking-[0.06em] mb-1"
                  style={{ color: "var(--garden-dim)", fontFamily: "var(--garden-font-mono)" }}
                >
                  Tax status
                </dt>
                <dd style={{ color: "var(--garden-body)" }}>
                  <strong style={{ color: "var(--garden-citron)" }}>Tax-deductible.</strong>{" "}
                  Abiding Practice is a 501(c)(3). Your donation is a charitable
                  gift, and you&apos;ll receive a receipt for your records.
                </dd>
              </div>
            </dl>
          </div>
          <Link
            to="/fund/abiding-practice"
            className="inline-block px-5 py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
          >
            Give to the Grant Fund
          </Link>
        </section>

        {/* Side by side comparison */}
        <section>
          <SectionLabel>At a glance</SectionLabel>
          <div
            className="rounded-xl border overflow-hidden mt-3"
            style={{ borderColor: "var(--garden-hairline)" }}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ color: "var(--garden-body)" }}>
                <thead>
                  <tr style={{ backgroundColor: "var(--garden-ink-raised)" }}>
                    <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--garden-dim)" }}>&nbsp;</th>
                    <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--garden-paper)" }}>Direct Backing</th>
                    <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--garden-paper)" }}>Grant Fund</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["You choose the creative", "Yes", "No — the fund decides"],
                    ["Tax-deductible", "No", "Yes (501(c)(3))"],
                    ["Creative keeps", "90%", "100% of the grant"],
                    ["Runs through", "Platform Stripe", "Abiding Practice"],
                    ["Public ledger", "Supporters listed on project", "Full ledger at /fund"],
                    ["Recurring option", "Monthly or annual", "By arrangement"],
                  ].map(([label, direct, grant], i) => (
                    <tr
                      key={i}
                      style={{
                        borderTop: "1px solid var(--garden-hairline)",
                        backgroundColor: i % 2 === 0 ? "transparent" : "var(--garden-ink-raised)",
                      }}
                    >
                      <td className="px-4 py-3 font-medium" style={{ color: "var(--garden-dim)" }}>{label}</td>
                      <td className="px-4 py-3">{direct}</td>
                      <td className="px-4 py-3">{grant}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQ-style closer */}
        <section className="mt-14">
          <SectionLabel>Common questions</SectionLabel>
          <div className="flex flex-col gap-6 mt-4">
            <div>
              <h3 className="font-semibold mb-1" style={{ color: "var(--garden-paper)" }}>
                Can I do both?
              </h3>
              <p style={{ color: "var(--garden-body)" }}>
                Yes. Many patrons back individual projects they believe in and also
                donate to the Grant Fund. They serve different purposes and the money
                flows through different channels.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-1" style={{ color: "var(--garden-paper)" }}>
                What&apos;s the minimum to back a project?
              </h3>
              <p style={{ color: "var(--garden-body)" }}>
                $5. One-time or recurring. When a creative sets up patron tiers, you
                can pick a level — or enter a custom amount.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-1" style={{ color: "var(--garden-paper)" }}>
                How do creatives get grants?
              </h3>
              <p style={{ color: "var(--garden-body)" }}>
                Creatives propose projects on the platform. Abiding Practice reviews
                proposals and awards grants based on its mission. The fund ledger
                records every grant publicly.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-1" style={{ color: "var(--garden-paper)" }}>
                Where can I see where the money went?
              </h3>
              <p style={{ color: "var(--garden-body)" }}>
                The{" "}
                <Link
                  to="/fund/abiding-practice"
                  className="underline underline-offset-2"
                  style={{ color: "var(--garden-citron)" }}
                >
                  Grant Fund ledger
                </Link>
                {" "}is public. Every inflow and outflow is posted for anyone to see,
                no account required.
              </p>
            </div>
          </div>
        </section>
      </div>
    </GardenPage>
  );
}
