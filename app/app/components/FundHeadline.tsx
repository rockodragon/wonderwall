// The Sophia Grant Fund as a headline (Rick, 2026-11-06): its icon fills the
// card, and its name and what it has to give are set over the picture's foot,
// like a news lead. The whole card opens the fund's page. On the visitor home
// (brand/GardenHome.tsx) and a member's phone Today (routes/today.tsx), from
// the same input the Canvas's fund card reads (desk/deskInput.ts fundFrom),
// so the amount is the one everywhere else shows.

import { Link } from "react-router";
import type { DeskFundInput } from "../desk/deskCards";
import { fundPath } from "../lib/namedFunds";

const INK = "#F4F4F2";
const ACCENT = "#FFE066";
/** Dark enough at the foot that the words read over the icon's whites. */
const FADE = "linear-gradient(to top, rgba(12,12,12,.94) 0%, rgba(12,12,12,.82) 28%, rgba(12,12,12,.35) 52%, rgba(12,12,12,0) 70%)";

export function FundHeadline({
  fund,
  money,
  className = "",
}: {
  /** undefined while loading; null when there's no fund to show. */
  fund: DeskFundInput | null | undefined;
  money: (cents: number) => string;
  className?: string;
}) {
  if (fund === null) return null;
  const box = `relative block aspect-[4/5] w-full overflow-hidden rounded-xl ${className}`;
  if (fund === undefined) return <div aria-hidden className={box} style={{ background: "#1c1c1c" }} />;

  const amount = money(fund.availableCents);
  return (
    <Link to={fundPath(fund.slug)} className={`${box} no-underline`} style={{ background: "#1c1c1c", color: INK }}>
      {fund.art && (
        <img
          src={fund.art.src}
          alt=""
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: "50% 30%" }}
        />
      )}
      <div aria-hidden className="absolute inset-0" style={{ background: FADE }} />
      <div className="absolute inset-x-0 bottom-0 p-5 md:p-6">
        <p className="m-0 text-[12px] uppercase" style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.2em", color: ACCENT }}>
          Grant fund
        </p>
        <h3 className="m-0 mt-2" style={{ fontSize: "clamp(28px, 7.5vw, 36px)", fontWeight: 600, lineHeight: 1.02, letterSpacing: "-0.02em", textWrap: "balance" }}>
          {fund.name}
        </h3>
        <p className="m-0 mt-3 flex items-baseline gap-2" style={{ fontSize: 16 }}>
          <span style={{ fontSize: "clamp(24px, 6vw, 30px)", fontWeight: 600, letterSpacing: "-0.02em" }}>{amount}</span>
          <span style={{ opacity: 0.9 }}>available to grant</span>
        </p>
      </div>
    </Link>
  );
}
