// /unsubscribe/:token — email unsubscribe link. Public and deliberately
// OUTSIDE the _app.tsx layout, same reasoning as routes/claim.$token.tsx:
// the person clicking this link from an email may not be signed in, and
// that layout redirects anyone signed out straight to /login.

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useParams } from "react-router";
import { api } from "../../convex/_generated/api";
import { SiteHeader } from "../components/SiteHeader";

export function meta() {
  return [
    { title: "Email preferences — TheCreative.exchange" },
    { name: "robots", content: "noindex" },
  ];
}

const EMAIL_TOGGLES: {
  category: "activity" | "digest" | "announcements";
  label: string;
  description: string;
}[] = [
  {
    category: "activity",
    label: "Activity",
    description: "Messages, project interest, event sign-ups and bookings",
  },
  {
    category: "digest",
    label: "Digest",
    description: "A summary of new likes, up to three times a day",
  },
  {
    category: "announcements",
    label: "Announcements",
    description: "Updates and reminders from hosts of classes and projects you're in",
  },
];

/** A Table guest's stop token (convex/garden/eventRsvps.ts
 * GUEST_EMAIL_TOKEN_PREFIX). Guests have no account, so no preferences:
 * the page offers one button instead. */
const isGuestToken = (token: string | undefined) => !!token?.startsWith("table-");

function GuestStop({ token }: { token: string }) {
  const info = useQuery(api.garden.eventRsvps.getGuestEmailStop, { token });
  const stop = useMutation(api.emailPreferences.unsubscribeByToken);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  async function handleStop() {
    setPending(true);
    try {
      await stop({ token });
      setDone(true);
    } catch (err) {
      console.error("Stop error:", err);
    } finally {
      setPending(false);
    }
  }
  if (info === undefined)
    return <p className="text-[var(--garden-dim)] text-sm">Loading…</p>;
  if (info === null)
    return (
      <h1 className="text-2xl font-bold text-[var(--garden-paper)] mb-4">
        This link is no longer valid.
      </h1>
    );
  if (done || info.stopped)
    return (
      <>
        <h1 className="text-2xl font-bold text-[var(--garden-paper)] mb-3 leading-tight">
          Done.
        </h1>
        <p className="text-[var(--garden-body)]">
          You won't get more email about {info.tableName}.
        </p>
      </>
    );
  return (
    <>
      <h1 className="text-2xl font-bold text-[var(--garden-paper)] mb-3 leading-tight">
        Stop email about {info.tableName}?
      </h1>
      <p className="text-[var(--garden-body)] mb-6">
        No more new dates or changes from this Table.
      </p>
      <button
        type="button"
        onClick={handleStop}
        disabled={pending}
        className="px-6 py-3 rounded-xl font-semibold bg-[var(--garden-citron)] text-[var(--garden-ink)] hover:opacity-90 transition-all disabled:opacity-50"
      >
        {pending ? "Stopping…" : "Stop these emails"}
      </button>
    </>
  );
}

export default function Unsubscribe() {
  const { token } = useParams();
  if (token && isGuestToken(token))
    return (
      <div className="min-h-screen bg-[var(--garden-ink)]">
        <SiteHeader />
        <main className="px-6 pt-8 pb-24 max-w-[560px] mx-auto">
          <GuestStop token={token} />
        </main>
      </div>
    );
  return <PreferencesByToken token={token} />;
}

function PreferencesByToken({ token }: { token: string | undefined }) {
  const prefs = useQuery(
    api.emailPreferences.getByToken,
    token ? { token } : "skip",
  );
  const unsubscribeByToken = useMutation(api.emailPreferences.unsubscribeByToken);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [pendingAll, setPendingAll] = useState(false);
  const [doneAll, setDoneAll] = useState(false);
  const [localPrefs, setLocalPrefs] = useState<{
    activity: boolean;
    digest: boolean;
    announcements: boolean;
  } | null>(null);

  const current = localPrefs ?? prefs;

  async function handleTurnOff(category: "activity" | "digest" | "announcements") {
    if (!token) return;
    setPendingCategory(category);
    try {
      await unsubscribeByToken({ token, category });
      setLocalPrefs((prev) => ({
        activity: prev?.activity ?? prefs?.activity ?? true,
        digest: prev?.digest ?? prefs?.digest ?? true,
        announcements: prev?.announcements ?? prefs?.announcements ?? true,
        [category]: false,
      }));
    } catch (err) {
      console.error("Unsubscribe error:", err);
    } finally {
      setPendingCategory(null);
    }
  }

  async function handleUnsubscribeAll() {
    if (!token) return;
    setPendingAll(true);
    try {
      await unsubscribeByToken({ token });
      setDoneAll(true);
    } catch (err) {
      console.error("Unsubscribe-all error:", err);
    } finally {
      setPendingAll(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--garden-ink)]">
      <SiteHeader />
      <main className="px-6 pt-8 pb-24 max-w-[560px] mx-auto">
        {prefs === undefined ? (
          <p className="text-[var(--garden-dim)] text-sm">Loading…</p>
        ) : prefs === null ? (
          <>
            <h1 className="text-2xl font-bold text-[var(--garden-paper)] mb-4">
              This link is no longer valid.
            </h1>
            <Link
              to="/settings?tab=account"
              className="text-[var(--garden-body)] hover:text-[var(--garden-citron)] font-medium text-sm"
            >
              Go to settings →
            </Link>
          </>
        ) : doneAll ? (
          <>
            <h1 className="text-2xl font-bold text-[var(--garden-paper)] mb-3 leading-tight">
              Done.
            </h1>
            <p className="text-[var(--garden-body)]">
              You won't get activity, digest or announcement email.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-[var(--garden-paper)] mb-6 leading-tight">
              Email preferences
            </h1>
            <div className="space-y-4 mb-8">
              {EMAIL_TOGGLES.map((toggle) => {
                const isOn = Boolean(current?.[toggle.category]);
                return (
                  <div
                    key={toggle.category}
                    className="flex items-start justify-between gap-4 pb-4 border-b border-[var(--garden-hairline)]"
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--garden-paper)]">
                        {toggle.label}
                      </p>
                      <p className="text-xs text-[var(--garden-dim)] mt-0.5">
                        {toggle.description}
                      </p>
                      {!isOn && (
                        <p className="text-xs text-[var(--garden-dim)] mt-1">
                          Off ·{" "}
                          <Link
                            to="/settings?tab=account"
                            className="hover:text-[var(--garden-citron)] underline"
                          >
                            sign in to turn back on
                          </Link>
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleTurnOff(toggle.category)}
                      disabled={!isOn || pendingCategory === toggle.category}
                      className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium border border-[var(--garden-hairline)] text-[var(--garden-body)] hover:text-[var(--garden-paper)] hover:border-[var(--garden-citron)] transition-colors disabled:opacity-40 disabled:hover:text-[var(--garden-body)] disabled:hover:border-[var(--garden-hairline)]"
                    >
                      {pendingCategory === toggle.category
                        ? "Turning off…"
                        : isOn
                          ? "Turn off"
                          : "Off"}
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={handleUnsubscribeAll}
              disabled={pendingAll}
              className="px-6 py-3 rounded-xl font-semibold bg-[var(--garden-citron)] text-[var(--garden-ink)] hover:opacity-90 transition-all disabled:opacity-50"
            >
              {pendingAll ? "Unsubscribing…" : "Unsubscribe from all"}
            </button>
          </>
        )}
      </main>
    </div>
  );
}
