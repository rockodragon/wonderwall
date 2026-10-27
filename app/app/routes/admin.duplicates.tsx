// /admin/duplicates — people and organizations that look like the same one
// entered twice (two "Sarah Shreves", "The Grove Center for" and "The Grove
// Center for the Arts & Media"). Each group shows its copies side by side
// with what each one holds. Pick the copy to keep, read what will happen
// (the server's dry run, in plain words), then confirm. "Not duplicates"
// puts the group away for good. convex/admin/duplicates.ts does the work.
//
// Written for someone who doesn't think in tables and ids: the words say
// what happens to the person, their things and their sign-in. Ids are only
// in the small print, for support.

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState, type ReactNode } from "react";
import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { displayPhone } from "../../convex/phone";
import { admin } from "../components/admin/adminStyles";
import {
  AdminAccessDenied,
  AdminFrame,
  AdminHeader,
  AdminLoading,
  AdminNotice,
} from "../components/admin/AdminUi";
import { OrgLogo } from "../components/OrgLogo";
import { PersonAvatar } from "../components/PersonAvatar";
import { shownInterests } from "../constants/interests";
import { formatDate } from "../garden/ui";
import { errorMessage } from "../lib/convexError";
import { timeAgo } from "../lib/dates";
import { useIsAdmin } from "../lib/useIsAdmin";

export const meta: MetaFunction = () => {
  return [{ title: "Possible duplicates | Admin" }, { name: "robots", content: "noindex" }];
};

type Found = FunctionReturnType<typeof api.admin.duplicates.findDuplicates>;
type PersonGroup = Found["people"][number];
type Person = PersonGroup["members"][number];
type OrgGroup = Found["organizations"][number];
type Org = OrgGroup["members"][number];
type Plan = FunctionReturnType<typeof api.admin.duplicates.previewPeopleMerge>;

export default function AdminDuplicatesPage() {
  const isAdmin = useIsAdmin();
  const found = useQuery(api.admin.duplicates.findDuplicates, isAdmin === true ? {} : "skip");
  const [done, setDone] = useState<Plan[]>([]);

  if (isAdmin === undefined) return <AdminLoading>Checking access…</AdminLoading>;
  if (!isAdmin) return <AdminAccessDenied />;

  const onDone = (plan: Plan) => setDone((list) => [plan, ...list]);

  return (
    <AdminFrame width="wide">
      <AdminHeader
        title="Possible duplicates"
        back
        sub={
          found
            ? `Checked ${found.checked.people} people and ${found.checked.organizations} organizations.`
            : undefined
        }
      />

      <p className={`${admin.body} mb-6 max-w-3xl`}>
        These look like the same person or organization entered twice. For each one, pick the copy to
        keep. You'll see exactly what will happen before anything changes, and nothing changes until you
        confirm. If two aren't the same, choose “Not duplicates” and they won't be suggested again.
      </p>

      {done.map((plan, i) => (
        <AdminNotice key={i} tone="ok" className="mb-4">
          <p className="font-semibold">Merged into {plan.keep.name}.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {plan.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </AdminNotice>
      ))}

      {found === undefined ? (
        <AdminLoading>Looking for duplicates…</AdminLoading>
      ) : (
        <>
          <Section
            title="People"
            count={found.people.length}
            empty="No people look entered twice."
          >
            {found.people.map((group) => (
              <PeopleGroup key={group.key} group={group} onDone={onDone} />
            ))}
          </Section>
          <Section
            title="Organizations"
            count={found.organizations.length}
            empty="No organizations look entered twice."
          >
            {found.organizations.map((group) => (
              <OrgsGroup key={group.key} group={group} onDone={onDone} />
            ))}
          </Section>
        </>
      )}
    </AdminFrame>
  );
}

function Section({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className={`${admin.h2} mb-3`}>
        {title}{" "}
        <span className={admin.meta}>
          · {count === 0 ? "none found" : count === 1 ? "1 group" : `${count} groups`}
        </span>
      </h2>
      {count === 0 ? (
        <div className={admin.panel}>
          <p className={admin.meta}>{empty}</p>
        </div>
      ) : (
        <div className="space-y-6">{children}</div>
      )}
    </section>
  );
}

// ——— One group: the copies, the choice, the preview ———

type GroupProps<T> = {
  title: string;
  reasons: string[];
  members: T[];
  idOf: (m: T) => string;
  card: (m: T) => ReactNode;
  preview: (keep: T, others: T[]) => Promise<Plan>;
  merge: (keep: T, others: T[]) => Promise<Plan>;
  dismiss: () => Promise<unknown>;
  onDone: (plan: Plan) => void;
};

function DuplicateGroup<T>({ title, reasons, members, idOf, card, preview, merge, dismiss, onDone }: GroupProps<T>) {
  const [keepId, setKeepId] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState<"preview" | "merge" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const keep = members.find((m) => idOf(m) === keepId) ?? null;
  const others = members.filter((m) => idOf(m) !== keepId);

  async function choose(m: T) {
    setKeepId(idOf(m));
    setPlan(null);
    setError(null);
    setBusy("preview");
    try {
      setPlan(await preview(m, members.filter((x) => idOf(x) !== idOf(m))));
    } catch (err) {
      setError(errorMessage(err, "Couldn't work out what merging would do. Try again."));
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    if (!keep) return;
    setError(null);
    setBusy("merge");
    try {
      onDone(await merge(keep, others));
    } catch (err) {
      setError(errorMessage(err, "The merge didn't go through. Nothing was changed."));
      setBusy(null);
    }
  }

  async function notDuplicates() {
    setError(null);
    setBusy("dismiss");
    try {
      await dismiss();
    } catch (err) {
      setError(errorMessage(err, "Couldn't put this group away. Try again."));
      setBusy(null);
    }
  }

  function cancel() {
    setKeepId(null);
    setPlan(null);
    setError(null);
  }

  return (
    <article className={admin.panel} aria-label={`Possible duplicates: ${title}`}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={admin.h3}>
            {title} <span className={admin.meta}>· {members.length} copies</span>
          </h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {reasons.map((r) => (
              <span key={r} className={admin.chip.neutral}>
                {r}
              </span>
            ))}
          </div>
        </div>
        <button type="button" className={admin.btnSecondary} onClick={notDuplicates} disabled={busy !== null}>
          {busy === "dismiss" ? "Putting away…" : "Not duplicates"}
        </button>
      </header>

      <p className={`${admin.meta} mb-3`}>
        {keep ? "The highlighted copy stays. The others are merged into it." : "Pick the copy to keep."}
      </p>

      <ul className={`grid gap-3 ${members.length >= 3 ? "lg:grid-cols-3" : ""} sm:grid-cols-2`}>
        {members.map((m) => {
          const id = idOf(m);
          const kept = id === keepId;
          const goes = keepId !== null && !kept;
          return (
            <li
              key={id}
              className={`flex flex-col rounded-xl border p-4 transition-colors ${
                kept
                  ? "border-[color:var(--app-accent)] bg-[var(--app-accent-wash)]"
                  : "border-[color:var(--app-hairline)] bg-[var(--app-surface)]"
              } ${goes ? "opacity-80" : ""}`}
            >
              {kept && <span className={`${admin.chip.green} mb-2`}>Keeping this one</span>}
              {goes && <span className={`${admin.chip.amber} mb-2`}>Merged into the kept one</span>}
              <div className="flex-1">{card(m)}</div>
              <div className="mt-4">
                <button
                  type="button"
                  className={kept ? admin.btnRowSecondary : admin.btnRowPrimary}
                  onClick={() => (kept ? cancel() : choose(m))}
                  disabled={busy === "merge" || busy === "dismiss"}
                  aria-pressed={kept}
                >
                  {kept ? "Pick again" : "Keep this one"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {error && (
        <AdminNotice tone="error" className="mt-4">
          {error}
        </AdminNotice>
      )}

      {busy === "preview" && <p className={`${admin.meta} mt-4`}>Working out what would happen…</p>}

      {plan && keep && (
        <div className={`${admin.inset} mt-4 p-4 sm:p-5`} aria-live="polite">
          <h4 className={admin.h3}>
            If you keep {plan.keep.name}
            {plan.keep.contact ? ` (${plan.keep.contact})` : ""}:
          </h4>
          <ul className={`${admin.body} mt-2 list-disc space-y-1 pl-5`}>
            {plan.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {plan.signIn.length > 0 && (
            <>
              <h5 className={`${admin.h3} mt-4`}>Signing in</h5>
              <ul className={`${admin.body} mt-1 list-disc space-y-1 pl-5`}>
                {plan.signIn.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          )}
          {plan.warnings.length > 0 && (
            <AdminNotice tone="warn" className="mt-4">
              <ul className="space-y-1">
                {plan.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </AdminNotice>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={admin.btnPrimary} onClick={confirm} disabled={busy !== null}>
              {busy === "merge" ? "Merging…" : "Confirm merge"}
            </button>
            <button type="button" className={admin.btnQuiet} onClick={cancel} disabled={busy === "merge"}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

// ——— People ———

function PeopleGroup({ group, onDone }: { group: PersonGroup; onDone: (plan: Plan) => void }) {
  const preview = useMutation(api.admin.duplicates.previewPeopleMerge);
  const merge = useMutation(api.admin.duplicates.mergePeople);
  const dismiss = useMutation(api.admin.duplicates.dismissDuplicates);
  const ids = (others: Person[]) => others.map((o) => o.userId);
  const title = group.members.find((m) => !m.unfinished)?.name ?? group.members[0].name;
  return (
    <DuplicateGroup
      title={title}
      reasons={group.reasons}
      members={group.members}
      idOf={(m) => m.userId}
      card={(m) => <PersonCard person={m} />}
      preview={(keep, others) => preview({ keepUserId: keep.userId, mergeUserIds: ids(others) })}
      merge={(keep, others) => merge({ keepUserId: keep.userId, mergeUserIds: ids(others) })}
      dismiss={() => dismiss({ kind: "person", ids: group.members.map((m) => m.userId) })}
      onDone={onDone}
    />
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className={admin.hint}>{label}</dt>
      <dd className="text-[13.5px] font-medium tabular-nums text-[color:var(--app-text)]">{children}</dd>
    </div>
  );
}

const missing = <span className={admin.hint}>—</span>;

function PersonCard({ person: p }: { person: Person }) {
  const interests = shownInterests(p.interests);
  const c = p.counts;
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <PersonAvatar name={p.name} imageUrl={p.imageUrl} size="lg" tone="muted" />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-[color:var(--app-text)] break-words">
            {p.profileId && !p.unfinished ? (
              <Link to={`/profile/${p.profileId}`} className={admin.link}>
                {p.name}
              </Link>
            ) : (
              p.name
            )}
          </p>
          <p className={admin.meta}>{p.handle ? `@${p.handle}` : "No @address"}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {p.unfinished && <span className={admin.chip.amber}>Unfinished signup</span>}
            {p.isYou && <span className={admin.chip.sky}>You</span>}
            {p.isAdmin && <span className={admin.chip.purple}>Admin</span>}
            {!p.imageUrl && <span className={admin.chip.neutral}>No photo</span>}
          </div>
        </div>
      </div>

      <div className={`${admin.meta} space-y-0.5 break-words`}>
        <p>{p.email ?? "No email"}</p>
        {p.phone && <p>{displayPhone(p.phone)}</p>}
        <p>
          Signs in with {p.signIns.length ? p.signIns.join(", ") : "nothing yet"}
        </p>
        <p>
          Joined {formatDate(p.createdAt)}
          {p.lastActiveAt ? ` · active ${timeAgo(p.lastActiveAt)}` : ""}
        </p>
      </div>

      <p className={`${admin.body} break-words`}>
        {p.bio ? (
          <>
            {p.bio}
            {p.bioCut ? "…" : ""}
          </>
        ) : (
          <span className={admin.hint}>No bio</span>
        )}
      </p>

      {interests.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {interests.map((i) => (
            <span key={i} className={admin.chip.neutral}>
              {i}
            </span>
          ))}
        </div>
      ) : (
        <p className={admin.hint}>No interests</p>
      )}

      <p className={admin.meta}>{p.location ?? "No location"}</p>
      {p.organizations.length > 0 && (
        <p className={admin.meta}>Part of {p.organizations.join(", ")}</p>
      )}
      {p.hasBilling && <p className={admin.meta}>Has a billing account with Stripe</p>}

      <dl className={`${admin.ruleTop} grid grid-cols-2 gap-x-4 gap-y-1 pt-3`}>
        <Fact label="Projects">{c.projects || missing}</Fact>
        <Fact label="Pieces of work">{c.pieces || missing}</Fact>
        <Fact label="Events hosted">{c.eventsHosted || missing}</Fact>
        <Fact label="Followers">{c.followers || missing}</Fact>
        <Fact label="Following">{c.following || missing}</Fact>
        <Fact label="Organizations">{c.organizations || missing}</Fact>
        <Fact label="Messages sent">{c.messages || missing}</Fact>
        <Fact label="Tickets · RSVPs">
          {c.tickets || c.rsvps ? `${c.tickets} · ${c.rsvps}` : missing}
        </Fact>
        <Fact label="Memberships">{c.memberships || missing}</Fact>
      </dl>

      <p className={`${admin.hint} break-all`}>
        For support: {p.userId}
        {p.profileId ? ` · ${p.profileId}` : ""}
      </p>
    </div>
  );
}

// ——— Organizations ———

function OrgsGroup({ group, onDone }: { group: OrgGroup; onDone: (plan: Plan) => void }) {
  const preview = useMutation(api.admin.duplicates.previewOrgMerge);
  const merge = useMutation(api.admin.duplicates.mergeOrgs);
  const dismiss = useMutation(api.admin.duplicates.dismissDuplicates);
  const ids = (others: Org[]) => others.map((o) => o.organizationId);
  const longest = [...group.members].sort((a, b) => b.name.length - a.name.length)[0];
  return (
    <DuplicateGroup
      title={longest.name}
      reasons={group.reasons}
      members={group.members}
      idOf={(m) => m.organizationId}
      card={(m) => <OrgCard org={m} />}
      preview={(keep, others) => preview({ keepId: keep.organizationId, mergeIds: ids(others) })}
      merge={(keep, others) => merge({ keepId: keep.organizationId, mergeIds: ids(others) })}
      dismiss={() => dismiss({ kind: "organization", ids: group.members.map((m) => m.organizationId) })}
      onDone={onDone}
    />
  );
}

function OrgCard({ org: o }: { org: Org }) {
  const current = o.members.filter((m) => m.current);
  const former = o.members.filter((m) => !m.current);
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <OrgLogo name={o.name} logoUrl={o.logoUrl} size="md" />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-[color:var(--app-text)] break-words">
            <Link to={`/orgs/${o.slug}`} className={admin.link}>
              {o.name}
            </Link>
          </p>
          <p className={`${admin.meta} break-all`}>/orgs/{o.slug}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <span className={admin.chip.neutral}>{o.category ?? "No type"}</span>
            {!o.logoUrl && <span className={admin.chip.neutral}>No logo</span>}
          </div>
        </div>
      </div>

      <div className={`${admin.meta} space-y-0.5 break-words`}>
        <p>{o.location ?? "No location"}</p>
        <p>{o.websiteUrl ?? "No website"}</p>
        <p>
          Added {formatDate(o.createdAt)} by {o.createdByName}
        </p>
      </div>

      <p className={`${admin.body} break-words`}>
        {o.tagline ?? o.about ?? <span className={admin.hint}>No tagline or about</span>}
      </p>

      <div>
        <p className={admin.hint}>People</p>
        {current.length > 0 ? (
          <ul className={`${admin.meta} mt-0.5 space-y-0.5`}>
            {current.map((m, i) => (
              <li key={i}>
                {m.name}
                {m.title ? `, ${m.title}` : ""}
                {m.isAdmin ? " · admin" : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className={admin.meta}>Nobody listed</p>
        )}
        {former.length > 0 && (
          <p className={`${admin.hint} mt-1`}>Formerly: {former.map((m) => m.name).join(", ")}</p>
        )}
      </div>

      <dl className={`${admin.ruleTop} grid grid-cols-2 gap-x-4 gap-y-1 pt-3`}>
        <Fact label="People">{current.length || missing}</Fact>
        <Fact label="Projects">{o.counts.projects || missing}</Fact>
        <Fact label="Events hosted">{o.counts.events || missing}</Fact>
      </dl>

      <p className={`${admin.hint} break-all`}>For support: {o.organizationId}</p>
    </div>
  );
}
