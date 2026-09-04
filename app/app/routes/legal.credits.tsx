import { Link } from "react-router";
import { CREDITS } from "../lib/campaign";

// Photography credits. CC BY requires visible attribution wherever the work
// is used, so this page is a licence obligation, not a nicety — every page
// carrying campaign photography links here.

export function meta() {
  return [
    { title: "Photography credits — creatives.exchange" },
    {
      name: "description",
      content: "Attribution for the photography used on creatives.exchange.",
    },
  ];
}

export default function Credits() {
  return (
    <div className="min-h-screen bg-[var(--garden-ink)]">
      <header className="px-6 py-6 max-w-3xl mx-auto">
        <Link
          to="/"
          className="text-[var(--garden-body)] hover:text-[var(--garden-paper)] text-sm font-medium transition-colors"
        >
          ← creatives.exchange
        </Link>
      </header>
      <main className="px-6 pb-24 max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold text-[var(--garden-paper)] mb-5">
          Photography credits
        </h1>
        <p className="text-[var(--garden-body)] leading-relaxed mb-10 max-w-2xl">
          The photographs on this site are Creative Commons works, converted to
          black and white. They stand in until we shoot our own. Each is
          credited below under its licence.
        </p>
        <ul className="flex flex-col gap-3">
          {CREDITS.map((c) => (
            <li
              key={c.src}
              className="text-[var(--garden-body)] text-[15px] leading-relaxed"
            >
              {c.credit}
            </li>
          ))}
        </ul>
        <p className="mt-10 text-[var(--garden-dim)] text-sm">
          Sourced through Openverse.
        </p>
      </main>
    </div>
  );
}
