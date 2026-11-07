// Under every "Text me a code" button (sign-in, sign-up, event RSVP,
// Settings → Phone number): what the text is, how often, rates, STOP and
// HELP, with the terms and privacy policy. The carriers' toll-free
// verification for the sign-in number looks for this next to where the
// number is typed.

import { Link } from "react-router";
import { CODE_TEXT_LINE } from "../../convex/textConsentWording";

export function CodeTextNote({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <p className={`text-[13px] ${className}`} style={style}>
      {CODE_TEXT_LINE}{" "}
      <Link to="/legal/terms" className="underline">
        Terms
      </Link>
      {" · "}
      <Link to="/legal/privacy" className="underline">
        Privacy Policy
      </Link>
    </p>
  );
}
