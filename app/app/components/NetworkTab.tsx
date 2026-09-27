import { useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { inviteAllowanceLabel, useInviteLink } from "../lib/useInviteLink";

// Settings → Network: your invite link (in full, copy/share) and the
// people behind the "N in network" count — who invited you, who you
// invited, and who they brought in — each row a link to their profile.
export function NetworkTab() {
  const network = useQuery(api.invites.getMyNetwork);

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

          <PeopleSection
            title="You invited"
            empty={
              network.direct.length === 0
                ? "No one yet. Send your link to someone whose work you respect."
                : undefined
            }
          >
            {network.direct.map((p) => (
              <PersonRow key={p.profileId} person={p} />
            ))}
          </PeopleSection>

          {network.downstream.length > 0 && (
            <PeopleSection title="Who they invited">
              {network.downstream.map((p) => (
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
    inviteLink,
    url,
    hasUsesLeft,
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
      ) : !hasUsesLeft ? (
        <p className="text-sm" style={{ color: "var(--app-text-dim)" }}>
          You've used all {inviteLink?.currentLimit} invites. More unlock as
          the people you invited join and invite others.
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
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{
                backgroundColor: "var(--app-accent)",
                color: "var(--app-accent-ink)",
              }}
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
            {canShare && (
              <button
                type="button"
                onClick={share}
                className="px-4 py-2 rounded-lg text-sm font-medium border"
                style={{ borderColor: "var(--app-hairline-raised)", color: "var(--app-text)" }}
              >
                Share…
              </button>
            )}
            <span className="text-xs" style={{ color: "var(--app-text-dim)" }}>
              {inviteAllowanceLabel(inviteLink)}
            </span>
          </div>
        </>
      )}
    </section>
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
    person.invitedCount > 0 ? `invited ${person.invitedCount}` : "",
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
        <span aria-hidden style={{ color: "var(--app-text-dim)" }}>
          →
        </span>
      </Link>
    </li>
  );
}
