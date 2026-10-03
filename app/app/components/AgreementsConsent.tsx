// The consent line under every way into an account (signup, login). A new
// account joins one community (getSignupCommunity — the default today), so
// the line covers that community's agreements, exactly as its hosts wrote
// them in host tools (2026-10-03: the community's list only). They open in
// place rather than on another page. With no agreements to show, the line
// is just the Terms and Privacy Policy.

import { useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";

export function AgreementsConsent({ lead, className = "" }: { lead: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const community = useQuery(api.garden.defaultCommunity.getSignupCommunity, {});
  const agreements = community?.agreements ?? [];
  const terms = (
    <Link to="/legal/terms" className="text-blue-600 hover:text-blue-500">
      Terms of Service
    </Link>
  );
  const privacy = (
    <Link to="/legal/privacy" className="text-blue-600 hover:text-blue-500">
      Privacy Policy
    </Link>
  );

  return (
    <div className={`text-xs text-gray-500 dark:text-gray-400 leading-relaxed ${className}`}>
      {agreements.length === 0 ? (
        <p className="text-center">
          {lead} you agree to our {terms} and {privacy}.
        </p>
      ) : (
        <p className="text-center">
          {lead} you agree to our {terms}, {privacy}, and{" "}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="text-blue-600 hover:text-blue-500 underline-offset-2 hover:underline"
          >
            community agreements
          </button>
          .
        </p>
      )}
      {open && agreements.length > 0 && (
        <ul className="mt-3 text-left rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3 list-disc pl-8 space-y-1 text-[13.5px] text-gray-600 dark:text-gray-300">
          {agreements.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
