// /communities/:slug — one community's public page, inside the app shell
// (docs/features/community-groups.md §0, docs/features/community-ux.md §3).
// Section order: header -> join/leave/home -> tables -> upcoming events ->
// projects -> classes & coaching -> for members (products) -> fund link ->
// host tools, collapsed by default. Re-skinned to the app shell's
// --garden-* token system; every mutation/query/action call below is
// unchanged from the previous GardenNav-wrapped version.

import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Link, useParams, useRouteError, useSearchParams } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { formatDateTime, formatMoney, joinNames } from "../garden/ui";

export function meta() {
  return [
    { title: "Community — creatives.exchange" },
    { name: "robots", content: "noindex" },
  ];
}

export function ErrorBoundary() {
  useRouteError();
  return (
    <PageShell>
      <p className="text-sm" style={{ color: "var(--garden-dim)" }}>
        This community isn't live yet — check back soon.
      </p>
    </PageShell>
  );
}

function reasonFor(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as { reason?: string } | undefined;
    if (data?.reason) return data.reason;
  }
  return fallback;
}

// ————— Shared shell + style bits (garden tokens, app-shell conventions —
// same values as projects.tsx/offerings.tsx) —————

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--garden-ink)]">
      <link rel="stylesheet" href="/tokens.css" />
      <link rel="stylesheet" href="/about/fonts/fonts.css" />
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">{children}</div>
    </div>
  );
}

const cardStyle = { borderColor: "var(--garden-hairline)", backgroundColor: "var(--garden-ink-raised)" };
const cellClass = "rounded-xl border px-4 py-3";
const inputClass = "w-full px-3 py-2 rounded-lg border text-sm outline-none";
const inputStyle = { backgroundColor: "var(--garden-ink)", borderColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" };
const labelClass = "block text-xs uppercase tracking-[0.06em] mb-1.5";
const labelStyle = { color: "var(--garden-dim)" };
const btnPrimaryClass = "px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-opacity hover:opacity-90";
const btnPrimaryStyle = { backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" };
const btnGhostClass = "px-3.5 py-2 rounded-lg text-sm font-medium border disabled:opacity-50 transition-colors";
const btnGhostStyle = { borderColor: "var(--garden-hairline-raised)", color: "var(--garden-muted)" };

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      className="text-[11px] font-semibold uppercase tracking-[0.08em]"
      style={{ color: "var(--garden-dim)", fontFamily: "var(--garden-font-mono)" }}
    >
      {children}
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs" style={{ color: "var(--garden-dim)" }}>
      {children}
    </p>
  );
}

function Loading({ label = "Loading…" }: { label?: string }) {
  return <Hint>{label}</Hint>;
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
  leaders: { userId: string; name: string; isOwner: boolean }[];
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
    isOwner: boolean;
    canJoin: { allowed: boolean; reason?: string };
    joinWouldBePending: boolean;
  };
};

type Product = {
  _id: Id<"communityProducts">;
  hostOrgId: Id<"hostOrgs">;
  name: string;
  description?: string;
  benefits?: string;
  priceCents: number;
  billing: "one_time" | "monthly";
  resourceCount: number;
  status: string;
  sortOrder: number;
  viewer: { hasAccess: boolean; canManage: boolean };
};

function priceLabel(priceCents: number, billing: string): string {
  return billing === "monthly" ? `${formatMoney(priceCents)}/mo` : `${formatMoney(priceCents)} one-time`;
}

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
        className={btnGhostClass}
        style={btnGhostStyle}
      >
        Sign in to join
      </Link>
    );
  }

  const membership = community.viewer.membership;

  if (membership && membership.status === "pending") {
    return (
      <p className="text-sm" style={{ color: "var(--garden-muted)" }}>
        Request sent — a host will confirm.
      </p>
    );
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
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-sm" style={{ color: "var(--garden-paper)" }}>You're in.</span>
          <button className={btnGhostClass} style={btnGhostStyle} disabled={busy} onClick={handleLeave}>
            Leave
          </button>
        </div>
        <label
          className="mt-3 flex items-start gap-2 text-[13.5px]"
          style={{ color: "var(--garden-muted)" }}
        >
          <input
            type="checkbox"
            checked={membership.isHome}
            disabled={busy}
            onChange={(e) => handleHomeToggle(e.target.checked)}
            className="mt-1"
          />
          <span>
            Make this my home community.
            <br />
            Your dues support your home community's project pool.
          </span>
        </label>
        {note && <p className="mt-2 text-sm" style={{ color: "var(--garden-body)" }}>{note}</p>}
      </div>
    );
  }

  // Not (currently) a member: either free to join, or denied.
  const { canJoin, joinWouldBePending } = community.viewer;

  if (!canJoin.allowed) {
    return (
      <p className="text-sm" style={{ color: "var(--garden-muted)" }}>
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
      <button className={btnPrimaryClass} style={btnPrimaryStyle} disabled={busy} onClick={handleJoin}>
        {busy ? "Joining…" : joinWouldBePending ? "Ask to join" : "Join — free"}
      </button>
      {note && <p className="mt-2.5 text-sm" style={{ color: "var(--garden-body)" }}>{note}</p>}
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
      <div>
        <label className={labelClass} style={labelStyle}>Tagline</label>
        <input className={inputClass} style={inputStyle} value={tagline} onChange={(e) => setTagline(e.target.value)} />
      </div>
      <div className="mt-3.5">
        <label className={labelClass} style={labelStyle}>Description</label>
        <textarea
          className={`${inputClass} resize-y`}
          style={inputStyle}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
        />
      </div>
      <div className="mt-3.5">
        <label className={labelClass} style={labelStyle}>Location</label>
        <input className={inputClass} style={inputStyle} value={locationLabel} onChange={(e) => setLocationLabel(e.target.value)} />
      </div>
      <div className="mt-3.5">
        <label className={labelClass} style={labelStyle}>Website</label>
        <input className={inputClass} style={inputStyle} value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} />
      </div>
      <div className="mt-3.5">
        <label className={labelClass} style={labelStyle}>Join policy</label>
        <select className={inputClass} style={inputStyle} value={joinPolicy} onChange={(e) => setJoinPolicy(e.target.value)}>
          {JOIN_POLICIES.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>
      <div className="mt-3.5">
        <label className={labelClass} style={labelStyle}>Visibility</label>
        <select className={inputClass} style={inputStyle} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
          {VISIBILITIES.map((v) => (
            <option key={v.value} value={v.value}>{v.label}</option>
          ))}
        </select>
      </div>
      <button className={btnPrimaryClass} style={{ ...btnPrimaryStyle, marginTop: 16 }} type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save changes"}
      </button>
      {status && (
        <p className="mt-2.5 text-sm" style={{ color: status.kind === "ok" ? "var(--garden-citron)" : "var(--garden-body)" }}>
          {status.kind === "ok" ? "✓ " : ""}
          {status.text}
        </p>
      )}
    </form>
  );
}

/** Owner, Admin, Member, Pending — the plain label the spec wants, not the
 * raw role/status pair. Pending outranks role; owner outranks pending. */
function memberLabel(m: { role: string; status: string; isOwner: boolean }): string {
  if (m.isOwner) return "Owner";
  if (m.status === "pending") return "Pending";
  if (m.role === "host") return "Admin";
  return "Member";
}

function MemberRoster({ hostOrgId, isOwner }: { hostOrgId: Id<"hostOrgs">; isOwner: boolean }) {
  const members = useQuery(api.garden.communities.listMembers, { hostOrgId });
  const setMemberStatus = useMutation(api.garden.communities.setMemberStatus);
  const setMemberRole = useMutation(api.garden.communities.setMemberRole);
  const transferOwnership = useMutation(api.garden.communities.transferOwnership);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Two-step inline confirm for "Transfer ownership" — never window.confirm.
  const [confirmTransferId, setConfirmTransferId] = useState<string | null>(null);

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

  async function changeRole(userId: string, role: "host" | "member") {
    setBusyId(userId);
    setError(null);
    try {
      await setMemberRole({ hostOrgId, userId: userId as Id<"users">, role });
    } catch (err) {
      setError(reasonFor(err, "Couldn't update that member — try again."));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmTransfer(userId: string) {
    setBusyId(userId);
    setError(null);
    try {
      await transferOwnership({ hostOrgId, userId: userId as Id<"users"> });
      setConfirmTransferId(null);
    } catch (err) {
      setError(reasonFor(err, "Couldn't transfer ownership — try again."));
    } finally {
      setBusyId(null);
    }
  }

  if (members === undefined) {
    return <Loading label="Loading members…" />;
  }
  if (members === null || members.length === 0) {
    return <Hint>No members yet.</Hint>;
  }

  return (
    <div className="flex flex-col gap-2">
      {members.map((m) => {
        const busy = busyId === m.userId;
        const confirmingTransfer = confirmTransferId === m.userId;
        return (
          <div
            key={m.userId}
            className={cellClass}
            style={{ ...cardStyle, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}
          >
            <div>
              <span className="text-sm font-semibold" style={{ color: "var(--garden-paper)" }}>{m.name}</span>
              <span className="text-xs ml-2" style={{ color: "var(--garden-dim)" }}>{memberLabel(m)}</span>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              {m.role !== "host" && (
                <>
                  {m.status === "pending" && (
                    <button className={btnGhostClass} style={btnGhostStyle} disabled={busy} onClick={() => act(m.userId, "active")}>
                      Approve
                    </button>
                  )}
                  <button className={btnGhostClass} style={btnGhostStyle} disabled={busy} onClick={() => act(m.userId, "removed")}>
                    Remove
                  </button>
                </>
              )}
              {isOwner && !m.isOwner && m.status === "active" && (
                <>
                  {m.role === "host" ? (
                    <button className={btnGhostClass} style={btnGhostStyle} disabled={busy} onClick={() => changeRole(m.userId, "member")}>
                      Remove admin
                    </button>
                  ) : (
                    <button className={btnGhostClass} style={btnGhostStyle} disabled={busy} onClick={() => changeRole(m.userId, "host")}>
                      Make admin
                    </button>
                  )}
                  {confirmingTransfer ? (
                    <>
                      <button className={btnGhostClass} style={btnGhostStyle} disabled={busy} onClick={() => confirmTransfer(m.userId)}>
                        {busy ? "Transferring…" : "Confirm transfer"}
                      </button>
                      <button className={btnGhostClass} style={btnGhostStyle} disabled={busy} onClick={() => setConfirmTransferId(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button className={btnGhostClass} style={btnGhostStyle} disabled={busy} onClick={() => setConfirmTransferId(m.userId)}>
                      Transfer ownership
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
      {error && <p className="text-xs" style={{ color: "var(--garden-body)" }}>{error}</p>}
    </div>
  );
}

// ————— Sections —————

// The same rule ProductsSection already applies below: an empty section is a
// dead-end for a random visitor (four stacked "nothing yet" blocks read as
// broken, not new), so it's simply not rendered for them. A manager still
// sees it, with a link straight to the create flow instead of a bare
// sentence — the empty state is useful information for the one person who
// can act on it.
function TablesSection({
  tables,
  canManage,
}: {
  tables: Community["tables"];
  canManage: boolean;
  slug: string;
}) {
  if (tables.length === 0 && !canManage) return null;
  return (
    <div className="mt-7">
      <SectionLabel>Tables</SectionLabel>
      {tables.length === 0 ? (
        <div className="mt-2.5"><Hint>No tables here yet. Tables are hand-created for now — message us to set one up.</Hint></div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {tables.map((t) => (
            <Link key={t._id} to={`/tables/${t.slug}`} className={cellClass} style={{ ...cardStyle, display: "block", textDecoration: "none" }}>
              <span className="text-sm font-semibold" style={{ color: "var(--garden-paper)" }}>{t.name}</span>
              <span className="text-xs ml-2.5" style={{ color: "var(--garden-dim)" }}>
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

function EventsSection({
  events,
  canManage,
  slug,
}: {
  events: Community["events"];
  canManage: boolean;
  slug: string;
}) {
  if (events.length === 0 && !canManage) return null;
  return (
    <div className="mt-7">
      <SectionLabel>Upcoming events</SectionLabel>
      {events.length === 0 ? (
        <div className="mt-2.5">
          <Hint>Nothing scheduled yet.</Hint>{" "}
          <Link to={`/events?community=${slug}`} className="text-sm" style={{ color: "var(--garden-citron)" }}>
            Put one on →
          </Link>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {events.map((e) => (
            <Link key={e._id} to={`/events/${e._id}`} className={cellClass} style={{ ...cardStyle, display: "block", textDecoration: "none" }}>
              <span className="text-sm font-semibold" style={{ color: "var(--garden-paper)" }}>{e.title}</span>
              <div className="text-xs mt-1" style={{ color: "var(--garden-dim)" }}>
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

function ProjectsSection({
  projects,
  canManage,
  slug,
}: {
  projects: Community["projects"];
  canManage: boolean;
  slug: string;
}) {
  if (projects.length === 0 && !canManage) return null;
  return (
    <div className="mt-7">
      <SectionLabel>Projects</SectionLabel>
      {projects.length === 0 ? (
        <div className="mt-2.5">
          <Hint>No projects posted here yet.</Hint>{" "}
          <Link to={`/projects?community=${slug}`} className="text-sm" style={{ color: "var(--garden-citron)" }}>
            Post the first one →
          </Link>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {projects.map((p) => (
            <Link key={p._id} to={`/projects/${p._id}`} className={cellClass} style={{ ...cardStyle, display: "block", textDecoration: "none" }}>
              <span className="text-sm font-semibold" style={{ color: "var(--garden-paper)" }}>{p.title}</span>
              <span className="text-xs ml-2.5" style={{ color: "var(--garden-dim)" }}>by {p.byName}</span>
              {p.blurb && <p className="text-xs mt-1" style={{ color: "var(--garden-dim)" }}>{p.blurb}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function OfferingsSection({
  offerings,
  canManage,
  slug,
}: {
  offerings: Community["offerings"];
  canManage: boolean;
  slug: string;
}) {
  if (offerings.length === 0 && !canManage) return null;
  return (
    <div className="mt-7">
      <SectionLabel>Classes &amp; coaching</SectionLabel>
      {offerings.length === 0 ? (
        <div className="mt-2.5">
          <Hint>Nothing offered here yet.</Hint>{" "}
          <Link to={`/offerings?community=${slug}`} className="text-sm" style={{ color: "var(--garden-citron)" }}>
            Post one →
          </Link>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {offerings.map((o) => (
            <Link key={o._id} to="/offerings" className={cellClass} style={{ ...cardStyle, display: "block", textDecoration: "none" }}>
              <span className="text-sm font-semibold" style={{ color: "var(--garden-paper)" }}>{o.title}</span>
              <span className="text-xs ml-2.5" style={{ color: "var(--garden-dim)" }}>
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

function ProductResources({ productId }: { productId: Id<"communityProducts"> }) {
  const access = useQuery(api.garden.products.getProductAccess, { productId });

  if (access === undefined) {
    return <Loading label="Loading resources…" />;
  }
  if (!access || !access.hasAccess) return null;
  if (access.resources.length === 0) {
    return <div className="mt-2.5"><Hint>No resources listed yet.</Hint></div>;
  }
  return (
    <div className="mt-2.5 flex flex-col gap-1.5">
      {access.resources.map((r, i) => (
        <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" className="text-sm" style={{ color: "var(--garden-citron)" }}>
          {r.label} →
        </a>
      ))}
    </div>
  );
}

function ProductCard({ product, slug }: { product: Product; slug: string }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const createProductCheckout = useAction(api.garden.stripe.createProductCheckout);
  const [showResources, setShowResources] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBuy() {
    setError(null);
    setBusy(true);
    try {
      const { url } = await createProductCheckout({ productId: product._id });
      window.location.href = url;
    } catch (err) {
      setError(reasonFor(err, "Couldn't start checkout — try again."));
      setBusy(false);
    }
  }

  const actionWord = product.billing === "monthly" ? "Join" : "Buy";

  return (
    <div className="rounded-2xl border p-4" style={cardStyle}>
      <div className="flex justify-between gap-2.5 flex-wrap">
        <span className="font-semibold text-base" style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}>
          {product.name}
        </span>
        {product.viewer.hasAccess && (
          <span
            className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-[0.06em] h-fit"
            style={{ backgroundColor: "rgba(215,242,90,0.14)", color: "var(--garden-citron)", fontFamily: "var(--garden-font-mono)" }}
          >
            You're in
          </span>
        )}
      </div>
      {product.description && (
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--garden-body)" }}>{product.description}</p>
      )}
      {product.benefits && (
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--garden-muted)" }}>{product.benefits}</p>
      )}
      <div className="mt-2.5 text-xs" style={{ color: "var(--garden-dim)" }}>
        {priceLabel(product.priceCents, product.billing)}
        {product.resourceCount > 0
          ? ` · ${product.resourceCount} private resource${product.resourceCount === 1 ? "" : "s"}`
          : ""}
      </div>

      {product.viewer.hasAccess ? (
        <>
          <button className={btnGhostClass} style={{ ...btnGhostStyle, marginTop: 14 }} onClick={() => setShowResources((s) => !s)}>
            {showResources ? "Hide resources" : "Show resources"}
          </button>
          {showResources && <ProductResources productId={product._id} />}
        </>
      ) : isLoading ? null : !isAuthenticated ? (
        <Link to={`/login?redirect=/communities/${slug}`} className={`${btnGhostClass} inline-block`} style={{ ...btnGhostStyle, marginTop: 14 }}>
          Sign in to {actionWord.toLowerCase()}
        </Link>
      ) : (
        <>
          <button className={btnPrimaryClass} style={{ ...btnPrimaryStyle, marginTop: 14 }} disabled={busy} onClick={handleBuy}>
            {busy ? "Starting checkout…" : `${actionWord} — ${formatMoney(product.priceCents)}`}
          </button>
          {error && <p className="mt-2 text-sm" style={{ color: "var(--garden-body)" }}>{error}</p>}
        </>
      )}
    </div>
  );
}

function ProductsSection({
  hostOrgId,
  slug,
  canManage,
  purchased,
}: {
  hostOrgId: Id<"hostOrgs">;
  slug: string;
  canManage: boolean;
  purchased: boolean;
}) {
  const products = useQuery(api.garden.products.listProducts, { hostOrgId }) as Product[] | undefined;

  if (products === undefined) {
    return (
      <div className="mt-7">
        <SectionLabel>For members</SectionLabel>
        <div className="mt-2.5"><Loading /></div>
      </div>
    );
  }

  if (products.length === 0 && !canManage) return null;

  return (
    <div className="mt-7">
      <SectionLabel>For members</SectionLabel>
      {purchased && (
        <div className="rounded-2xl border p-4 mt-3 max-w-[50ch]" style={{ ...cardStyle, borderColor: "var(--garden-citron)" }}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--garden-citron)", fontFamily: "var(--garden-font-mono)" }}>
            You're in
          </div>
          <p className="mt-2 text-sm">You're in. Your resources are below.</p>
        </div>
      )}
      {products.length === 0 ? (
        <div className="mt-2.5"><Hint>Nothing for sale here yet.</Hint></div>
      ) : (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {products.map((p) => (
            <ProductCard key={p._id} product={p} slug={slug} />
          ))}
        </div>
      )}
    </div>
  );
}

// ————— Host tools: products —————

const PRODUCT_BILLINGS = [
  { value: "one_time", label: "One-time" },
  { value: "monthly", label: "Monthly" },
] as const;

function ResourceRows({
  resources,
  onChange,
}: {
  resources: { label: string; url: string }[];
  onChange: (next: { label: string; url: string }[]) => void;
}) {
  function update(i: number, field: "label" | "url", value: string) {
    const next = resources.slice();
    next[i] = { ...next[i], [field]: value };
    onChange(next);
  }
  function add() {
    onChange([...resources, { label: "", url: "" }]);
  }
  function remove(i: number) {
    onChange(resources.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      {resources.map((r, i) => (
        <div key={i} className="flex gap-2 mt-2">
          <input className={inputClass} style={{ ...inputStyle, flex: 1 }} placeholder="Label" value={r.label} onChange={(e) => update(i, "label", e.target.value)} />
          <input className={inputClass} style={{ ...inputStyle, flex: 2 }} placeholder="https://…" value={r.url} onChange={(e) => update(i, "url", e.target.value)} />
          <button type="button" className={btnGhostClass} style={btnGhostStyle} onClick={() => remove(i)}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className={btnGhostClass} style={{ ...btnGhostStyle, marginTop: 8 }} onClick={add}>
        + Add resource
      </button>
    </div>
  );
}

function CreateProductForm({ hostOrgId }: { hostOrgId: Id<"hostOrgs"> }) {
  const createProduct = useMutation(api.garden.products.createProduct);
  const [name, setName] = useState("");
  const [priceDollars, setPriceDollars] = useState("");
  const [billing, setBilling] = useState<(typeof PRODUCT_BILLINGS)[number]["value"]>("one_time");
  const [benefits, setBenefits] = useState("");
  const [description, setDescription] = useState("");
  const [resources, setResources] = useState<{ label: string; url: string }[]>([]);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const priceCents = Math.round(parseFloat(priceDollars || "0") * 100);
      await createProduct({
        hostOrgId,
        name,
        description: description.trim() || undefined,
        benefits: benefits.trim() || undefined,
        priceCents,
        billing,
        resources: resources.filter((r) => r.label.trim() && r.url.trim()),
      });
      setStatus({ kind: "ok", text: `"${name}" created.` });
      setName("");
      setPriceDollars("");
      setBenefits("");
      setDescription("");
      setResources([]);
    } catch (err) {
      setStatus({ kind: "err", text: reasonFor(err, "Couldn't create the product — try again.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <label className={labelClass} style={labelStyle}>Name</label>
      <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Premium membership" />

      <label className={labelClass} style={{ ...labelStyle, marginTop: 14 }}>Price (dollars)</label>
      <input
        className={inputClass}
        style={{ ...inputStyle, maxWidth: 160 }}
        value={priceDollars}
        onChange={(e) => setPriceDollars(e.target.value)}
        inputMode="decimal"
        placeholder="25"
      />

      <div className="mt-3.5">
        <label className={labelClass} style={labelStyle}>Billing</label>
        <div className="flex gap-4">
          {PRODUCT_BILLINGS.map((b) => (
            <label key={b.value} className="flex items-center gap-1.5 text-sm" style={{ color: "var(--garden-body)" }}>
              <input type="radio" name="billing" checked={billing === b.value} onChange={() => setBilling(b.value)} />
              {b.label}
            </label>
          ))}
        </div>
      </div>

      <label className={labelClass} style={{ ...labelStyle, marginTop: 14 }}>Benefits</label>
      <textarea className={`${inputClass} resize-y`} style={inputStyle} value={benefits} onChange={(e) => setBenefits(e.target.value)} rows={2} />

      <label className={labelClass} style={{ ...labelStyle, marginTop: 14 }}>Description</label>
      <textarea className={`${inputClass} resize-y`} style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />

      <div className="mt-3.5">
        <label className={labelClass} style={labelStyle}>Resources</label>
        <ResourceRows resources={resources} onChange={setResources} />
      </div>

      <button className={btnPrimaryClass} style={{ ...btnPrimaryStyle, marginTop: 16 }} type="submit" disabled={busy || !name.trim() || !priceDollars.trim()}>
        {busy ? "Creating…" : "Create product"}
      </button>
      {status && (
        <p className="mt-2.5 text-sm" style={{ color: status.kind === "ok" ? "var(--garden-citron)" : "var(--garden-body)" }}>
          {status.kind === "ok" ? "✓ " : ""}
          {status.text}
        </p>
      )}
    </form>
  );
}

function EditProductRow({ product }: { product: Product }) {
  const updateProduct = useMutation(api.garden.products.updateProduct);
  const [editing, setEditing] = useState(false);
  const [priceDollars, setPriceDollars] = useState((product.priceCents / 100).toString());
  const [resources, setResources] = useState<{ label: string; url: string }[]>([]);
  const [resourcesLoaded, setResourcesLoaded] = useState(false);
  const access = useQuery(
    api.garden.products.getProductAccess,
    editing && !resourcesLoaded ? { productId: product._id } : "skip",
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (access && editing && !resourcesLoaded) {
      setResources(access.resources.map((r) => ({ ...r })));
      setResourcesLoaded(true);
    }
  }, [access, editing, resourcesLoaded]);

  async function toggleStatus() {
    setBusy(true);
    setStatus(null);
    try {
      await updateProduct({ productId: product._id, status: product.status === "active" ? "archived" : "active" });
    } catch (err) {
      setStatus({ kind: "err", text: reasonFor(err, "Couldn't update that product — try again.") });
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    setBusy(true);
    setStatus(null);
    try {
      const priceCents = Math.round(parseFloat(priceDollars || "0") * 100);
      await updateProduct({
        productId: product._id,
        priceCents,
        resources: resources.filter((r) => r.label.trim() && r.url.trim()),
      });
      setStatus({ kind: "ok", text: "Saved." });
      setEditing(false);
      setResourcesLoaded(false);
    } catch (err) {
      setStatus({ kind: "err", text: reasonFor(err, "Couldn't save — try again.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cellClass} style={cardStyle}>
      <div className="flex justify-between gap-2.5 flex-wrap">
        <span className="text-sm font-semibold" style={{ color: "var(--garden-paper)" }}>{product.name}</span>
        <span
          className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-[0.06em] h-fit"
          style={{ backgroundColor: "rgba(198,198,190,0.1)", color: "var(--garden-muted)", fontFamily: "var(--garden-font-mono)" }}
        >
          {product.status}
        </span>
      </div>
      <div className="text-xs mt-1.5" style={{ color: "var(--garden-dim)" }}>
        {priceLabel(product.priceCents, product.billing)} · {product.resourceCount} resource
        {product.resourceCount === 1 ? "" : "s"}
      </div>
      <div className="mt-2.5 flex gap-2">
        <button className={btnGhostClass} style={btnGhostStyle} disabled={busy} onClick={toggleStatus}>
          {product.status === "active" ? "Archive" : "Unarchive"}
        </button>
        <button className={btnGhostClass} style={btnGhostStyle} disabled={busy} onClick={() => setEditing((e) => !e)}>
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>
      {editing && (
        <div className="mt-3">
          <label className={labelClass} style={labelStyle}>Price (dollars)</label>
          <input
            className={inputClass}
            style={{ ...inputStyle, maxWidth: 160 }}
            value={priceDollars}
            onChange={(e) => setPriceDollars(e.target.value)}
            inputMode="decimal"
          />
          <div className="mt-3">
            <label className={labelClass} style={labelStyle}>Resources</label>
            {access === undefined && !resourcesLoaded ? (
              <Loading label="Loading resources…" />
            ) : (
              <ResourceRows resources={resources} onChange={setResources} />
            )}
          </div>
          <button className={btnPrimaryClass} style={{ ...btnPrimaryStyle, marginTop: 12 }} disabled={busy} onClick={saveEdit}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      )}
      {status && (
        <p className="mt-2 text-sm" style={{ color: status.kind === "ok" ? "var(--garden-citron)" : "var(--garden-body)" }}>
          {status.kind === "ok" ? "✓ " : ""}
          {status.text}
        </p>
      )}
    </div>
  );
}

function HostProductsList({ hostOrgId }: { hostOrgId: Id<"hostOrgs"> }) {
  const products = useQuery(api.garden.products.listProducts, { hostOrgId }) as Product[] | undefined;

  if (products === undefined) return <Loading />;
  if (products.length === 0) return <Hint>No products yet.</Hint>;

  return (
    <div className="flex flex-col gap-2">
      {products.map((p) => (
        <EditProductRow key={p._id} product={p} />
      ))}
    </div>
  );
}

// ————— Host tools: earnings —————

function StatCell({ value, label, hot }: { value: string; label: string; hot?: boolean }) {
  return (
    <div className="rounded-lg border px-3 py-2.5 text-center" style={hot ? { ...cardStyle, borderColor: "var(--garden-citron)" } : cardStyle}>
      <div className="text-lg font-semibold" style={{ color: hot ? "var(--garden-citron)" : "var(--garden-paper)", fontFamily: "var(--garden-font-mono)" }}>
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-[0.06em] mt-1" style={{ color: "var(--garden-dim)" }}>{label}</div>
    </div>
  );
}

function HostEarnings({ hostOrgId }: { hostOrgId: Id<"hostOrgs"> }) {
  const earnings = useQuery(api.garden.products.getCommunityEarnings, { hostOrgId });

  if (earnings === undefined) return <Loading />;
  if (earnings === null) return <Hint>Nothing to show yet.</Hint>;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <StatCell value={String(earnings.salesCount)} label="Sales" />
        <StatCell value={formatMoney(earnings.grossCents)} label="Gross" />
        <StatCell value={formatMoney(earnings.hostCents)} label="Your 90%" hot />
        <StatCell value={formatMoney(earnings.paidOutCents)} label="Paid out" />
        <StatCell value={formatMoney(earnings.owedCents)} label="Owed" />
      </div>
      <p className="mt-3 text-xs" style={{ color: "var(--garden-dim)" }}>
        Your share is paid out by hand for now — we'll record each transfer here.
      </p>

      <div className="mt-6">
        <div className="text-sm font-semibold mb-2.5" style={{ color: "var(--garden-paper)" }}>Recent sales</div>
        {earnings.recent.length === 0 ? (
          <Hint>Nothing sold yet.</Hint>
        ) : (
          <div className="flex flex-col">
            {earnings.recent.map((r) => (
              <div key={r.purchaseId} className="flex flex-wrap items-baseline gap-3 py-2.5 border-b" style={{ borderColor: "var(--garden-hairline)" }}>
                <span className="text-sm font-semibold" style={{ color: "var(--garden-paper)" }}>{r.productName}</span>
                <span className="text-xs" style={{ color: "var(--garden-dim)" }}>{r.buyerName}</span>
                <span className="text-xs" style={{ color: "var(--garden-dim)" }}>{formatMoney(r.hostCents)} of {formatMoney(r.grossCents)}</span>
                <span className="text-xs" style={{ color: "var(--garden-dim)" }}>{r.status}</span>
                <span className="text-xs" style={{ color: "var(--garden-dim)" }}>{formatDateTime(r.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6">
        <div className="text-sm font-semibold mb-2.5" style={{ color: "var(--garden-paper)" }}>Payouts</div>
        {earnings.payouts.length === 0 ? (
          <Hint>No payouts recorded yet.</Hint>
        ) : (
          <div className="flex flex-col">
            {earnings.payouts.map((p, i) => (
              <div key={i} className="flex flex-wrap items-baseline gap-3 py-2.5 border-b" style={{ borderColor: "var(--garden-hairline)" }}>
                <span className="text-sm font-semibold" style={{ color: "var(--garden-paper)" }}>{formatMoney(p.amountCents)}</span>
                {p.reference && <span className="text-xs" style={{ color: "var(--garden-dim)" }}>{p.reference}</span>}
                {p.note && <span className="text-xs" style={{ color: "var(--garden-dim)" }}>{p.note}</span>}
                <span className="text-xs" style={{ color: "var(--garden-dim)" }}>{formatDateTime(p.paidAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ————— Host tools panel: one collapsed <details>, closed by default —————

function HostToolsPanel({ community }: { community: Community }) {
  return (
    <details className="mt-10 rounded-2xl border" style={cardStyle}>
      <summary
        className="cursor-pointer select-none px-5 py-4 flex items-center justify-between gap-3 flex-wrap"
        style={{ listStyle: "none" }}
      >
        <span className="text-sm font-semibold" style={{ color: "var(--garden-paper)" }}>Host tools</span>
        <span className="text-xs" style={{ color: "var(--garden-dim)" }}>
          Edit, roster{community.pendingCount > 0 ? ` (${community.pendingCount} pending)` : ""}, products, earnings
        </span>
      </summary>
      <div className="px-5 pb-6 pt-1 border-t" style={{ borderColor: "var(--garden-hairline)" }}>
        <div className="mt-5">
          <SectionLabel>Community details</SectionLabel>
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <EditCommunityForm community={community} />
            <div>
              <div className="text-sm font-semibold mb-2.5" style={{ color: "var(--garden-paper)" }}>
                Members {community.pendingCount > 0 ? `(${community.pendingCount} pending)` : ""}
              </div>
              <MemberRoster hostOrgId={community._id} isOwner={community.viewer.isOwner} />
            </div>
          </div>
        </div>

        <div className="mt-9">
          <SectionLabel>Products</SectionLabel>
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <CreateProductForm hostOrgId={community._id} />
            <div>
              <div className="text-sm font-semibold mb-2.5" style={{ color: "var(--garden-paper)" }}>Current products</div>
              <HostProductsList hostOrgId={community._id} />
            </div>
          </div>
        </div>

        <div className="mt-9">
          <SectionLabel>Earnings</SectionLabel>
          <div className="mt-4">
            <HostEarnings hostOrgId={community._id} />
          </div>
        </div>
      </div>
    </details>
  );
}

// ————— Page —————

export default function CommunityDetailPage() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const purchased = searchParams.get("purchased") === "1";
  const community = useQuery(
    api.garden.communities.getCommunity,
    slug ? { slug } : "skip",
  ) as Community | null | undefined;

  if (community === undefined) {
    return (
      <PageShell>
        <Loading />
      </PageShell>
    );
  }

  if (community === null) {
    return (
      <PageShell>
        <p className="text-sm" style={{ color: "var(--garden-dim)" }}>
          Check the link — this community isn't here.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {community.status === "pending" && (
        <div className={cellClass} style={{ ...cardStyle, marginBottom: 20, fontSize: 13.5, color: "var(--garden-muted)" }}>
          In review — only you and operators can see this page until it's approved.
        </div>
      )}

      <h1
        className="text-2xl sm:text-3xl font-semibold"
        style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
      >
        {community.name}
      </h1>
      {community.tagline && (
        <p className="mt-2.5 text-[15px] leading-relaxed max-w-[58ch]" style={{ color: "var(--garden-body)" }}>
          {community.tagline}
        </p>
      )}
      <div className="mt-2.5 flex gap-3.5 flex-wrap text-[13.5px]" style={{ color: "var(--garden-muted)" }}>
        {community.locationLabel && <span>{community.locationLabel}</span>}
        {community.websiteUrl && (
          <a href={community.websiteUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--garden-citron)" }}>
            Website →
          </a>
        )}
        {community.leaders.length > 0 && (
          <span>Hosted by {joinNames(community.leaders.map((l) => l.name))}</span>
        )}
        <span>{community.memberCount} member{community.memberCount === 1 ? "" : "s"}</span>
      </div>
      {community.description && (
        <p className="mt-4 text-[15px] leading-relaxed max-w-[62ch]" style={{ color: "var(--garden-body)" }}>
          {community.description}
        </p>
      )}
      <div className="mt-4 flex items-baseline gap-3.5 flex-wrap text-[13.5px]">
        <span style={{ color: "var(--garden-muted)" }}>Browse everything in {community.name}:</span>
        <Link to={`/projects?community=${community.slug}`} style={{ color: "var(--garden-citron)" }}>Projects →</Link>
        <Link to={`/events?community=${community.slug}`} style={{ color: "var(--garden-citron)" }}>Events →</Link>
        <Link to={`/offerings?community=${community.slug}`} style={{ color: "var(--garden-citron)" }}>Classes →</Link>
      </div>

      <div className="mt-5">
        <JoinControl community={community} />
      </div>

      <TablesSection tables={community.tables} canManage={community.viewer.canManage} slug={community.slug} />
      <EventsSection events={community.events} canManage={community.viewer.canManage} slug={community.slug} />
      <ProjectsSection projects={community.projects} canManage={community.viewer.canManage} slug={community.slug} />
      <OfferingsSection offerings={community.offerings} canManage={community.viewer.canManage} slug={community.slug} />

      <ProductsSection
        hostOrgId={community._id}
        slug={community.slug}
        canManage={community.viewer.canManage}
        purchased={purchased}
      />

      {community.hasFund && (
        <div className="mt-7">
          <SectionLabel>Fund</SectionLabel>
          <Link to={`/fund/${community.slug}`} className="inline-block mt-2.5 text-sm" style={{ color: "var(--garden-citron)" }}>
            See the ledger →
          </Link>
        </div>
      )}

      {community.viewer.canManage && <HostToolsPanel community={community} />}
    </PageShell>
  );
}
