// /communities/:slug — one community's public page (docs/features/
// community-groups.md §0, §5 step 1): who runs it, who's in it, and
// everything tagged to it — tables, events, projects, classes, fund. Same
// three-state discipline as tables.$slug.tsx, plus a "Host tools" card for
// viewer.canManage and a review banner while the community is pending.

import { useState } from "react";
import type { FormEvent } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Link, useParams, useRouteError } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  GardenErrorState,
  GardenLoading,
  GardenNav,
  GardenPage,
  SectionLabel,
  formatDateTime,
  formatMoney,
} from "../garden/ui";
import "../garden/garden.css";

export function meta() {
  return [
    { title: "Community — creatives.exchange" },
    { name: "robots", content: "noindex" },
  ];
}

export function ErrorBoundary() {
  useRouteError();
  return (
    <GardenPage>
      <GardenNav active="Communities" />
      <div style={{ marginTop: 28 }}>
        <GardenErrorState message="This community isn't live yet — check back soon." />
      </div>
    </GardenPage>
  );
}

function reasonFor(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as { reason?: string } | undefined;
    if (data?.reason) return data.reason;
  }
  return fallback;
}

// ————— Types (shaped from getCommunity's return) —————

type Membership = { role: string; status: string; isHome: boolean } | null;

type Community = {
  _id: Id<"hostOrgs">;
  name: string;
  slug: string;
  tagline?: string;
  description?: string;
  websiteUrl?: string;
  locationLabel?: string;
  status: string;
  joinPolicy: string;
  visibility: string;
  hosts: string[];
  memberCount: number;
  pendingCount: number;
  hasFund: boolean;
  tables: { _id: string; name: string; slug: string; mode: string; format?: string; cadence?: string }[];
  events: { _id: string; title: string; datetime: number; location?: string }[];
  projects: { _id: string; title: string; kind: string; blurb?: string; storySlug?: string; byName: string }[];
  offerings: { _id: string; title: string; format?: string; cadence?: string; priceCents?: number }[];
  viewer: {
    isSignedIn: boolean;
    membership: Membership;
    canManage: boolean;
    canJoin: { allowed: boolean; reason?: string };
    joinWouldBePending: boolean;
  };
};

// ————— Join / membership control —————

function JoinControl({ community }: { community: Community }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const joinCommunity = useMutation(api.garden.communities.joinCommunity);
  const leaveCommunity = useMutation(api.garden.communities.leaveCommunity);
  const setHomeCommunity = useMutation(api.garden.communities.setHomeCommunity);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (isLoading) return null;

  if (!isAuthenticated) {
    return (
      <Link
        to={`/login?redirect=/communities/${community.slug}`}
        className="g-btn g-btn-ghost"
      >
        Sign in to join
      </Link>
    );
  }

  const membership = community.viewer.membership;

  if (membership && membership.status === "pending") {
    return <p style={{ fontSize: 14.5, color: "var(--g-muted)" }}>Request sent — a host will confirm.</p>;
  }

  if (membership && membership.status === "active") {
    async function handleLeave() {
      setBusy(true);
      setNote(null);
      try {
        await leaveCommunity({ hostOrgId: community._id });
      } catch (err) {
        setNote(reasonFor(err, "Couldn't leave — try again."));
      } finally {
        setBusy(false);
      }
    }
    async function handleHomeToggle(checked: boolean) {
      setBusy(true);
      setNote(null);
      try {
        await setHomeCommunity(checked ? { hostOrgId: community._id } : {});
      } catch (err) {
        setNote(reasonFor(err, "Couldn't update your home community."));
      } finally {
        setBusy(false);
      }
    }
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14.5, color: "var(--g-paper)" }}>You're in.</span>
          <button className="g-btn g-btn-ghost" disabled={busy} onClick={handleLeave}>
            Leave
          </button>
        </div>
        <label
          style={{
            marginTop: 12,
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            fontSize: 13.5,
            color: "var(--g-muted)",
          }}
        >
          <input
            type="checkbox"
            checked={membership.isHome}
            disabled={busy}
            onChange={(e) => handleHomeToggle(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            Make this my home community.
            <br />
            Your dues support your home community's project pool.
          </span>
        </label>
        {note && <p className="g-hint" style={{ marginTop: 8 }}>{note}</p>}
      </div>
    );
  }

  // Not (currently) a member: either free to join, or denied.
  const { canJoin, joinWouldBePending } = community.viewer;

  if (!canJoin.allowed) {
    return (
      <p style={{ fontSize: 14.5, color: "var(--g-muted)" }}>
        {canJoin.reason ?? "Joining isn't open right now."}
      </p>
    );
  }

  async function handleJoin() {
    setBusy(true);
    setNote(null);
    try {
      await joinCommunity({ hostOrgId: community._id });
    } catch (err) {
      setNote(reasonFor(err, "Couldn't join — try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="g-btn g-btn-citron" disabled={busy} onClick={handleJoin}>
        {busy ? "Joining…" : joinWouldBePending ? "Ask to join" : "Join — free"}
      </button>
      {note && <p style={{ marginTop: 10, fontSize: 14.5, color: "var(--g-body)" }}>{note}</p>}
    </div>
  );
}

// ————— Host tools: edit form + roster —————

const JOIN_POLICIES = [
  { value: "open", label: "Open — anyone can join" },
  { value: "apply", label: "Ask to join — you approve people" },
] as const;
const VISIBILITIES = [
  { value: "public", label: "Public — listed in the directory" },
  { value: "unlisted", label: "Unlisted — reachable only by link" },
] as const;

function EditCommunityForm({ community }: { community: Community }) {
  const updateCommunity = useMutation(api.garden.communities.updateCommunity);
  const [tagline, setTagline] = useState(community.tagline ?? "");
  const [description, setDescription] = useState(community.description ?? "");
  const [locationLabel, setLocationLabel] = useState(community.locationLabel ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(community.websiteUrl ?? "");
  const [joinPolicy, setJoinPolicy] = useState(community.joinPolicy);
  const [visibility, setVisibility] = useState(community.visibility);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      await updateCommunity({
        hostOrgId: community._id,
        tagline: tagline.trim() || undefined,
        description: description.trim() || undefined,
        locationLabel: locationLabel.trim() || undefined,
        websiteUrl: websiteUrl.trim() || undefined,
        joinPolicy,
        visibility,
      });
      setStatus({ kind: "ok", text: "Saved." });
    } catch (err) {
      setStatus({ kind: "err", text: reasonFor(err, "Couldn't save — try again.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div style={{ marginTop: 6 }}>
        <label className="g-label" style={{ display: "block", marginBottom: 6 }}>
          Tagline
        </label>
        <input className="g-input" value={tagline} onChange={(e) => setTagline(e.target.value)} />
      </div>
      <div style={{ marginTop: 14 }}>
        <label className="g-label" style={{ display: "block", marginBottom: 6 }}>
          Description
        </label>
        <textarea
          className="g-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          style={{ resize: "vertical" }}
        />
      </div>
      <div style={{ marginTop: 14 }}>
        <label className="g-label" style={{ display: "block", marginBottom: 6 }}>
          Location
        </label>
        <input
          className="g-input"
          value={locationLabel}
          onChange={(e) => setLocationLabel(e.target.value)}
        />
      </div>
      <div style={{ marginTop: 14 }}>
        <label className="g-label" style={{ display: "block", marginBottom: 6 }}>
          Website
        </label>
        <input
          className="g-input"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
        />
      </div>
      <div style={{ marginTop: 14 }}>
        <label className="g-label" style={{ display: "block", marginBottom: 6 }}>
          Join policy
        </label>
        <select
          className="g-input"
          value={joinPolicy}
          onChange={(e) => setJoinPolicy(e.target.value)}
          style={{ appearance: "none" }}
        >
          {JOIN_POLICIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div style={{ marginTop: 14 }}>
        <label className="g-label" style={{ display: "block", marginBottom: 6 }}>
          Visibility
        </label>
        <select
          className="g-input"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value)}
          style={{ appearance: "none" }}
        >
          {VISIBILITIES.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
      <button className="g-btn g-btn-citron" type="submit" disabled={busy} style={{ marginTop: 16 }}>
        {busy ? "Saving…" : "Save changes"}
      </button>
      {status && (
        <p style={{ marginTop: 10, fontSize: 14, color: status.kind === "ok" ? "var(--g-citron)" : "var(--g-body)" }}>
          {status.kind === "ok" ? "✓ " : ""}
          {status.text}
        </p>
      )}
    </form>
  );
}

function MemberRoster({ hostOrgId }: { hostOrgId: Id<"hostOrgs"> }) {
  const members = useQuery(api.garden.communities.listMembers, { hostOrgId });
  const setMemberStatus = useMutation(api.garden.communities.setMemberStatus);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(userId: string, next: "active" | "removed") {
    setBusyId(userId);
    setError(null);
    try {
      await setMemberStatus({ hostOrgId, userId: userId as Id<"users">, status: next });
    } catch (err) {
      setError(reasonFor(err, "Couldn't update that member — try again."));
    } finally {
      setBusyId(null);
    }
  }

  if (members === undefined) {
    return <GardenLoading label="Loading members…" />;
  }
  if (members === null || members.length === 0) {
    return <p className="g-hint">No members yet.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {members.map((m) => (
        <div
          key={m.userId}
          className="g-cell"
          style={{ padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}
        >
          <div>
            <span style={{ color: "var(--g-paper)", fontWeight: 600, fontSize: 14 }}>{m.name}</span>
            <span className="g-hint" style={{ marginLeft: 8 }}>
              {m.role}
              {m.status === "pending" ? " · pending" : ""}
            </span>
          </div>
          {m.role !== "host" && (
            <div style={{ display: "flex", gap: 8 }}>
              {m.status === "pending" && (
                <button
                  className="g-btn g-btn-ghost"
                  disabled={busyId === m.userId}
                  onClick={() => act(m.userId, "active")}
                >
                  Approve
                </button>
              )}
              <button
                className="g-btn g-btn-ghost"
                disabled={busyId === m.userId}
                onClick={() => act(m.userId, "removed")}
              >
                Remove
              </button>
            </div>
          )}
        </div>
      ))}
      {error && <p className="g-hint" style={{ color: "var(--g-body)" }}>{error}</p>}
    </div>
  );
}

function HostTools({ community }: { community: Community }) {
  return (
    <div className="g-card" style={{ marginTop: 28 }}>
      <SectionLabel>Host tools</SectionLabel>
      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "minmax(260px, 1fr) minmax(260px, 1.2fr)",
          gap: 24,
          alignItems: "start",
        }}
        className="g-op-grid"
      >
        <EditCommunityForm community={community} />
        <div>
          <div className="g-label" style={{ marginBottom: 10 }}>
            Members {community.pendingCount > 0 ? `(${community.pendingCount} pending)` : ""}
          </div>
          <MemberRoster hostOrgId={community._id} />
        </div>
      </div>
      <style>{`
        @media (max-width: 720px) {
          .g-op-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

// ————— Sections —————

function TablesSection({ tables }: { tables: Community["tables"] }) {
  return (
    <div style={{ marginTop: 28 }}>
      <SectionLabel>Tables</SectionLabel>
      {tables.length === 0 ? (
        <p className="g-hint" style={{ marginTop: 10 }}>No tables here yet.</p>
      ) : (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {tables.map((t) => (
            <Link
              key={t._id}
              to={`/tables/${t.slug}`}
              className="g-cell"
              style={{ display: "block", padding: "12px 14px", textDecoration: "none" }}
            >
              <span style={{ color: "var(--g-paper)", fontWeight: 600, fontSize: 14.5 }}>{t.name}</span>
              <span className="g-hint" style={{ marginLeft: 10 }}>
                {t.format ?? t.mode}
                {t.cadence ? ` · ${t.cadence}` : ""}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function EventsSection({ events }: { events: Community["events"] }) {
  return (
    <div style={{ marginTop: 28 }}>
      <SectionLabel>Upcoming events</SectionLabel>
      {events.length === 0 ? (
        <p className="g-hint" style={{ marginTop: 10 }}>Nothing scheduled yet.</p>
      ) : (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {events.map((e) => (
            <Link
              key={e._id}
              to={`/events/${e._id}`}
              className="g-cell"
              style={{ display: "block", padding: "12px 14px", textDecoration: "none" }}
            >
              <span style={{ color: "var(--g-paper)", fontWeight: 600, fontSize: 14.5 }}>{e.title}</span>
              <div className="g-hint" style={{ marginTop: 4 }}>
                {formatDateTime(e.datetime)}
                {e.location ? ` · ${e.location}` : ""}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectsSection({ projects }: { projects: Community["projects"] }) {
  return (
    <div style={{ marginTop: 28 }}>
      <SectionLabel>Projects</SectionLabel>
      {projects.length === 0 ? (
        <p className="g-hint" style={{ marginTop: 10 }}>No projects posted here yet.</p>
      ) : (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {projects.map((p) => (
            <Link
              key={p._id}
              to={`/projects/${p._id}`}
              className="g-cell"
              style={{ display: "block", padding: "12px 14px", textDecoration: "none" }}
            >
              <span style={{ color: "var(--g-paper)", fontWeight: 600, fontSize: 14.5 }}>{p.title}</span>
              <span className="g-hint" style={{ marginLeft: 10 }}>by {p.byName}</span>
              {p.blurb && <p className="g-hint" style={{ marginTop: 4 }}>{p.blurb}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function OfferingsSection({ offerings }: { offerings: Community["offerings"] }) {
  return (
    <div style={{ marginTop: 28 }}>
      <SectionLabel>Classes & coaching</SectionLabel>
      {offerings.length === 0 ? (
        <p className="g-hint" style={{ marginTop: 10 }}>Nothing offered here yet.</p>
      ) : (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {offerings.map((o) => (
            <Link
              key={o._id}
              to="/offerings"
              className="g-cell"
              style={{ display: "block", padding: "12px 14px", textDecoration: "none" }}
            >
              <span style={{ color: "var(--g-paper)", fontWeight: 600, fontSize: 14.5 }}>{o.title}</span>
              <span className="g-hint" style={{ marginLeft: 10 }}>
                {o.format ?? "Offering"}
                {o.cadence ? ` · ${o.cadence}` : ""}
                {o.priceCents ? ` · ${formatMoney(o.priceCents)}` : ""}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ————— Page —————

export default function CommunityDetailPage() {
  const { slug } = useParams();
  const community = useQuery(
    api.garden.communities.getCommunity,
    slug ? { slug } : "skip",
  ) as Community | null | undefined;

  if (community === undefined) {
    return (
      <GardenPage>
        <GardenNav active="Communities" />
        <div style={{ marginTop: 28 }}>
          <GardenLoading />
        </div>
      </GardenPage>
    );
  }

  if (community === null) {
    return (
      <GardenPage>
        <GardenNav active="Communities" />
        <div style={{ marginTop: 28 }}>
          <GardenErrorState message="Check the link — this community isn't here." />
        </div>
      </GardenPage>
    );
  }

  return (
    <GardenPage>
      <GardenNav active="Communities" />

      {community.status === "pending" && (
        <div
          className="g-cell"
          style={{ marginTop: 24, padding: "12px 14px", fontSize: 14, color: "var(--g-muted)" }}
        >
          In review — only you and operators can see this page until it's approved.
        </div>
      )}

      <div style={{ marginTop: 28 }}>
        <h1 className="g-h" style={{ fontSize: "clamp(28px,5vw,40px)" }}>
          {community.name}
        </h1>
        {community.tagline && (
          <p style={{ marginTop: 10, fontSize: 15, lineHeight: 1.5, maxWidth: "58ch" }}>
            {community.tagline}
          </p>
        )}
        <div style={{ marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13.5, color: "var(--g-muted)" }}>
          {community.locationLabel && <span>{community.locationLabel}</span>}
          {community.websiteUrl && (
            <a href={community.websiteUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--g-citron)" }}>
              Website →
            </a>
          )}
          {community.hosts.length > 0 && <span>Hosted by {community.hosts.join(", ")}</span>}
          <span>{community.memberCount} member{community.memberCount === 1 ? "" : "s"}</span>
        </div>
        {community.description && (
          <p style={{ marginTop: 16, fontSize: 15, lineHeight: 1.6, maxWidth: "62ch" }}>
            {community.description}
          </p>
        )}
      </div>

      <div style={{ marginTop: 22 }}>
        <JoinControl community={community} />
      </div>

      <TablesSection tables={community.tables} />
      <EventsSection events={community.events} />
      <ProjectsSection projects={community.projects} />
      <OfferingsSection offerings={community.offerings} />

      {community.hasFund && (
        <div style={{ marginTop: 28 }}>
          <SectionLabel>Fund</SectionLabel>
          <Link
            to={`/fund/${community.slug}`}
            style={{ display: "inline-block", marginTop: 10, fontSize: 14.5, color: "var(--g-citron)" }}
          >
            See the ledger →
          </Link>
        </div>
      )}

      {community.viewer.canManage && <HostTools community={community} />}
    </GardenPage>
  );
}
