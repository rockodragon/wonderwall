import { useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { useInviteLink } from "../lib/useInviteLink";

// Settings → Network: your invite link (in full, copy/share) and the
// people behind the "N in network" count — who invited you, who you
// invited, and who they brought in — each row a link to their profile.
type SortKey = "newest" | "network";

// Biggest subgraph first; ties go to more direct invites, then newest.
function sortPeople<T extends NetworkPerson>(people: T[], key: SortKey): T[] {
  if (key === "newest") return people;
  return [...people].sort(
    (a, b) =>
      b.networkCount - a.networkCount ||
      b.invitedCount - a.invitedCount ||
      b.joinedAt - a.joinedAt,
  );
}

export function NetworkTab() {
  const network = useQuery(api.invites.getMyNetwork);
  const [sort, setSort] = useState<SortKey>("newest");

  return (
    <div className="space-y-10">
      <InviteLinkPanel />

      {network === undefined ? (
        <p className="text-sm" style={{ color: "var(--app-text-dim)" }}>
          Loading your network…
        </p>
      ) : network === null ? null : (
        <>
          <div className="flex flex-wrap gap-6">
            <Stat value={network.direct.length} label="invited by you" />
            <Stat value={network.downstream.length} label="invited by them" />
          </div>

          {network.invitedBy && (
            <PeopleSection title="Invited you">
              <PersonRow person={network.invitedBy} />
            </PeopleSection>
          )}

          {network.direct.length + network.downstream.length > 1 && (
            <SortToggle value={sort} onChange={setSort} />
          )}

          <PeopleSection
            title="You invited"
            empty={
              network.direct.length === 0
                ? "No one yet. Send your link to someone whose work you respect."
                : undefined
            }
          >
            {sortPeople(network.direct, sort).map((p) => (
              <PersonRow key={p.profileId} person={p} />
            ))}
          </PeopleSection>

          {network.downstream.length > 0 && (
            <PeopleSection title="Who they invited">
              {sortPeople(network.downstream, sort).map((p) => (
                <PersonRow
                  key={p.profileId}
                  person={p}
                  via={{ name: p.viaName, profileId: p.viaProfileId }}
                />
              ))}
            </PeopleSection>
          )}
        </>
      )}
    </div>
  );
}

function InviteLinkPanel() {
  const {
    loading,
    url,
    copied,
    copy,
    canShare,
    share,
  } = useInviteLink("settings");

  return (
    <section>
      <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--app-text)" }}>
        Your invite link
      </h2>
      <p className="text-sm mb-4" style={{ color: "var(--app-text-dim)" }}>
        Anyone who signs up with it joins your network, and you follow each
        other automatically.
      </p>

      {loading ? (
        <p className="text-sm" style={{ color: "var(--app-text-dim)" }}>
          Getting your link…
        </p>
      ) : (
        <>
          <div
            className="rounded-lg px-3 py-2.5 mb-3 text-sm break-all select-all"
            style={{
              fontFamily: "var(--garden-font-mono)",
              backgroundColor: "var(--app-surface-raised)",
              color: "var(--app-text)",
              border: "1px solid var(--app-hairline)",
            }}
          >
            {url}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={copy}
              className={BUTTON_CLASS}
              style={BUTTON_STYLE}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? "Copied!" : "Copy link"}
            </button>
            {canShare && (
              <button
                type="button"
                onClick={share}
                className={BUTTON_CLASS}
                style={BUTTON_STYLE}
              >
                <ShareIcon />
                Share…
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

const BUTTON_CLASS =
  "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-[var(--app-hairline)]";
const BUTTON_STYLE = {
  borderColor: "var(--app-hairline-raised)",
  color: "var(--app-text)",
};

function CopyIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12M7 8l5-5 5 5" />
      <path d="M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6" />
    </svg>
  );
}

function SortToggle({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (key: SortKey) => void;
}) {
  const options: { key: SortKey; label: string }[] = [
    { key: "newest", label: "Newest" },
    { key: "network", label: "Biggest network" },
  ];
  return (
    <div className="flex items-center gap-2 text-xs" style={{ color: "var(--app-text-dim)" }}>
      <span>Sort</span>
      <div
        className="inline-flex rounded-lg p-0.5"
        style={{ backgroundColor: "var(--app-surface-raised)" }}
        role="group"
        aria-label="Sort people"
      >
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            aria-pressed={value === o.key}
            onClick={() => onChange(o.key)}
            className="px-3 py-1 rounded-md font-medium transition-colors"
            style={
              value === o.key
                ? { backgroundColor: "var(--app-hairline-raised)", color: "var(--app-text)" }
                : { color: "var(--app-text-dim)" }
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold" style={{ color: "var(--app-text)" }}>
        {value}
      </div>
      <div className="text-xs" style={{ color: "var(--app-text-dim)" }}>
        {label}
      </div>
    </div>
  );
}

function PeopleSection({
  title,
  empty,
  children,
}: {
  title: string;
  empty?: string;
  children?: React.ReactNode;
}) {
  return (
    <section>
      <h3
        className="text-xs font-semibold uppercase tracking-wider mb-2"
        style={{ color: "var(--app-text-dim)" }}
      >
        {title}
      </h3>
      {empty ? (
        <p className="text-sm" style={{ color: "var(--app-text-dim)" }}>
          {empty}
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--app-hairline)" }}>
          {children}
        </ul>
      )}
    </section>
  );
}

type NetworkPerson = {
  profileId: string;
  name: string;
  imageUrl: string | null;
  interests: string[];
  joinedAt: number;
  invitedCount: number;
  networkCount: number;
};

function PersonRow({
  person,
  via,
}: {
  person: NetworkPerson;
  via?: { name: string; profileId: string };
}) {
  const details = [
    person.interests.join(" · "),
    `joined ${new Date(person.joinedAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`,
  ].filter(Boolean);

  return (
    <li className="py-1" style={{ borderColor: "var(--app-hairline)" }}>
      <Link
        to={`/profile/${person.profileId}`}
        className="flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 transition-colors hover:bg-[var(--app-hairline)]"
      >
        {person.imageUrl ? (
          <img
            src={person.imageUrl}
            alt=""
            className="w-10 h-10 rounded-full object-cover shrink-0"
          />
        ) : (
          <div
            className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-sm font-semibold"
            style={{ backgroundColor: "var(--app-accent-wash)", color: "var(--app-text)" }}
          >
            {person.name.trim().charAt(0).toUpperCase() || "·"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate" style={{ color: "var(--app-text)" }}>
            {person.name}
          </div>
          <div className="text-xs truncate" style={{ color: "var(--app-text-dim)" }}>
            {via ? `via ${via.name} · ` : ""}
            {details.join(" · ")}
          </div>
        </div>
        <NetworkCount direct={person.invitedCount} total={person.networkCount} />
        <span aria-hidden style={{ color: "var(--app-text-dim)" }}>
          →
        </span>
      </Link>
    </li>
  );
}

// "3 +5": people they invited directly, then everyone further downstream.
function NetworkCount({ direct, total }: { direct: number; total: number }) {
  if (total === 0) return null;
  const further = total - direct;
  return (
    <span
      className="shrink-0 text-right text-xs tabular-nums"
      title={`${direct} invited directly${further > 0 ? `, ${further} more through them` : ""}`}
      style={{ color: "var(--app-text-dim)" }}
    >
      <span className="font-semibold text-sm" style={{ color: "var(--app-text)" }}>
        {direct}
      </span>{" "}
      direct
      {further > 0 && (
        <span className="ml-1.5" style={{ color: "var(--app-text-muted)" }}>
          +{further}
        </span>
      )}
    </span>
  );
}
