// The consent line under every way into an account (signup, login). A new
// account joins one community (getSignupCommunity — the default today;
// auth.ts records that join as agreed), so the line covers that
// community's agreements as its hosts wrote them and the platform's. They
// open in place rather than on another page — it's a few lines.

import { useQuery } from "convex/react";
import { Component, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { PLATFORM_AGREEMENTS } from "../constants/agreements";

function Group({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-3 first:mt-0">
      <p className="text-[13.5px] font-medium text-gray-700 dark:text-gray-200">{title}</p>
      {items.length > 0 && (
        <ul className="mt-1 list-disc pl-5 space-y-1 text-[13.5px] text-gray-600 dark:text-gray-300">
          {items.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SignupCommunityGroup() {
  const community = useQuery(api.garden.defaultCommunity.getSignupCommunity, {});
  if (!community) return null;
  return <Group title={`${community.name}, which new accounts join`} items={community.agreements} />;
}

/** The login page can't fall over on this list: if the backend is behind the
 * frontend (prod's isn't deployed on merge), the community's part is left
 * out and the platform's still shows. */
class SkipOnError extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function AgreementsConsent({ lead, className = "" }: { lead: string; className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`text-xs text-gray-500 dark:text-gray-400 leading-relaxed ${className}`}>
      <p className="text-center">
        {lead} you agree to our{" "}
        <Link to="/legal/terms" className="text-blue-600 hover:text-blue-500">
          Terms of Service
        </Link>
        ,{" "}
        <Link to="/legal/privacy" className="text-blue-600 hover:text-blue-500">
          Privacy Policy
        </Link>
        , and{" "}
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
      {open && (
        <div className="mt-3 text-left rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
          <Group title="TheCreative.exchange" items={PLATFORM_AGREEMENTS} />
          <SkipOnError>
            <SignupCommunityGroup />
          </SkipOnError>
        </div>
      )}
    </div>
  );
}
