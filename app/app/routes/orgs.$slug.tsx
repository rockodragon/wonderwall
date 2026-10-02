import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "../../convex/_generated/api";
import { yearsLabel } from "../../convex/organizationRules";
import { EventCard } from "../components/EventCard";
import { LocationMapCard } from "../components/LocationMapCard";
import { OrgLogo } from "../components/OrgLogo";
import { ShareButton } from "../components/ShareButton";
import { SocialLinks } from "../components/SocialLinks";
import { useBack } from "../lib/useBack";
import { PAGE_WIDTH } from "../lib/pageWidth";

// /orgs/:slug — an organization's public page (docs/features/organizations.md).
// Public like an event page: a signed-out guest who clicks a host lands here.
// People link to their profiles only for signed-in viewers, because the
// profile route needs an account.

type Org = NonNullable<FunctionReturnType<typeof api.organizations.getBySlug>>;
type Person = Org["people"][number];

const TITLE_SUFFIX = "The Creative Exchange";

export function meta() {
  return [{ title: `Organization · ${TITLE_SUFFIX}` }];
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export default function OrganizationPage() {
  const { slug } = useParams();
  const org = useQuery(api.organizations.getBySlug, slug ? { slug } : "skip");
  const events = useQuery(
    api.events.listForOrganization,
    org ? { organizationId: org._id } : "skip",
  );
  const join = useMutation(api.organizations.join);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const orgName = org?.name;
  useEffect(() => {
    if (orgName) document.title = `${orgName} · ${TITLE_SUFFIX}`;
  }, [orgName]);

  async function handleJoin() {
    if (!org || joining) return;
    setJoining(true);
    setJoinError(null);
    try {
      await join({ organizationId: org._id });
      setJoined(true);
    } catch (error) {
      const reason =
        error instanceof ConvexError &&
        typeof (error.data as { reason?: unknown } | undefined)?.reason === "string"
          ? (error.data as { reason: string }).reason
          : "Couldn't add it. Try again.";
      setJoinError(reason);
    } finally {
      setJoining(false);
    }
  }

  if (org === undefined) {
    return (
      <div className={`p-4 sm:p-6 ${PAGE_WIDTH.list} mx-auto`}>
        <div className="animate-pulse">
          <div className="flex items-start gap-4 sm:gap-6 mb-8">
            <div
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl shrink-0"
              style={{ backgroundColor: "var(--app-hairline-raised)" }}
            />
            <div className="flex-1">
              <div
                className="h-8 rounded w-48 max-w-full mb-2"
                style={{ backgroundColor: "var(--app-hairline-raised)" }}
              />
              <div
                className="h-4 rounded w-32 max-w-full"
                style={{ backgroundColor: "var(--app-hairline-raised)" }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (org === null) {
    return (
      <div className={`p-4 sm:p-6 ${PAGE_WIDTH.list} mx-auto text-center py-12`}>
        <p className="mb-4" style={{ color: "var(--app-text-muted)" }}>
          Organization not found
        </p>
        <Link
          to="/people?tab=orgs"
          className="text-sm font-medium hover:underline"
          style={{ color: "var(--app-accent-ink)" }}
        >
          All organizations
        </Link>
      </div>
    );
  }

  const { viewer } = org;
  const upcoming = events?.upcoming ?? [];
  const past = events?.past ?? [];
  const categoryLine = [org.category, org.location].filter(Boolean).join(" · ");
  const stats = [
    org.people.length > 0 ? plural(org.people.length, "person", "people") : null,
    upcoming.length > 0 ? plural(upcoming.length, "upcoming event", "upcoming events") : null,
  ].filter(Boolean);
  const paragraphs = (org.mission ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const profileLink = (p: Person) => (viewer.signedIn ? `/profile/${p.profileId}` : null);
  const sparse = viewer.canEdit && paragraphs.length === 0 && !org.logoUrl;
  const showJoinButton = viewer.signedIn && !viewer.hasPosition && !joined;

  return (
    <div className={`p-4 sm:p-6 ${PAGE_WIDTH.list} mx-auto`}>
      <BackLink />
      {/* Header: identity on the left, ways to act on the right — the same
          arrangement as a profile, with a square logo so it reads as an
          organization rather than a person. */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6 mb-8">
        <OrgLogo name={org.name} logoUrl={org.logoUrl} size="lg" />

        <div className="flex-1 min-w-0 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1
              className="text-xl sm:text-2xl font-bold break-words"
              style={{ color: "var(--app-text)" }}
            >
              {org.name}
            </h1>
            {categoryLine && (
              <p className="mt-1 text-sm sm:text-base" style={{ color: "var(--app-text-muted)" }}>
                {categoryLine}
              </p>
            )}
            {org.tagline && (
              <p className="mt-1 text-sm sm:text-base" style={{ color: "var(--app-text-muted)" }}>
                {org.tagline}
              </p>
            )}
            {stats.length > 0 && (
              <p className="mt-2 text-sm" style={{ color: "var(--app-text-dim)" }}>
                {stats.join(" · ")}
              </p>
            )}

            <div className="mt-3">
              <SocialLinks
                websiteUrl={org.websiteUrl}
                instagram={org.instagram}
                x={org.x}
                linkedin={org.linkedin}
              />
            </div>

            {org.hostOrg && (
              <Link
                to={
                  org.hostOrg.kind === "community"
                    ? `/communities/${org.hostOrg.slug}`
                    : `/fund/${org.hostOrg.slug}`
                }
                className="mt-3 inline-block text-sm font-medium hover:underline"
                style={{ color: "var(--app-accent-ink)" }}
              >
                {org.hostOrg.kind === "community" ? "Community →" : "Grant fund →"}
              </Link>
            )}

            {showJoinButton && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={handleJoin}
                  disabled={joining}
                  className="px-4 py-2 rounded-xl border text-sm font-medium transition-colors disabled:opacity-50 hover:border-[var(--app-accent)]"
                  style={{
                    backgroundColor: "var(--app-surface-raised)",
                    color: "var(--app-text)",
                    borderColor: "var(--app-hairline)",
                  }}
                >
                  Add to my profile
                </button>
                {joinError && <p className="mt-2 text-sm text-red-500">{joinError}</p>}
              </div>
            )}
            {joined && (
              <p className="mt-3 text-sm" style={{ color: "var(--app-text-muted)" }}>
                On your profile. Add your title in{" "}
                <Link
                  to="/settings#organizations"
                  className="font-medium hover:underline"
                  style={{ color: "var(--app-accent-ink)" }}
                >
                  Settings
                </Link>
                .
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {viewer.canEdit && (
              <Link
                to={`/orgs/${org.slug}/edit`}
                className="px-4 py-2 rounded-xl border text-sm font-medium transition-colors hover:border-[var(--app-accent)]"
                style={{
                  backgroundColor: "var(--app-surface-raised)",
                  color: "var(--app-text)",
                  borderColor: "var(--app-hairline)",
                }}
              >
                Edit
              </Link>
            )}
            <ShareButton type="organization" title={org.name} size="sm" />
          </div>
        </div>
      </div>

      {sparse && (
        <Link
          to={`/orgs/${org.slug}/edit`}
          className="mb-8 flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border text-sm font-medium transition-colors hover:border-[var(--app-accent)]"
          style={{
            backgroundColor: "var(--app-accent-wash)",
            borderColor: "var(--app-hairline)",
            color: "var(--app-text)",
          }}
        >
          <span>Add a logo, an about, and links.</span>
          <span aria-hidden="true" style={{ color: "var(--app-accent-ink)" }}>
            →
          </span>
        </Link>
      )}

      {paragraphs.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--app-text)" }}>
            About
          </h2>
          <div className="max-w-2xl space-y-4">
            {paragraphs.map((p, i) => (
              <p
                key={i}
                className="whitespace-pre-wrap break-words text-sm sm:text-base"
                style={{ color: "var(--app-text)" }}
              >
                {p}
              </p>
            ))}
          </div>
        </section>
      )}

      {org.people.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--app-text)" }}>
            People
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {org.people.map((p) => (
              <PersonCard key={p.profileId} person={p} href={profileLink(p)} />
            ))}
          </div>
        </section>
      )}

      {org.alumni.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--app-text)" }}>
            Alumni
          </h2>
          <ul className="divide-y divide-[var(--app-hairline)]">
            {org.alumni.map((p) => (
              <li key={p.profileId}>
                <AlumniRow person={p} href={profileLink(p)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {(upcoming.length > 0 || past.length > 0) && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--app-text)" }}>
            Events
          </h2>
          {upcoming.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcoming.map((event) => (
                <EventCard key={event._id} event={event} />
              ))}
            </div>
          )}
          {past.length > 0 && (
            <>
              <h3
                className="text-base font-semibold mb-3"
                style={{
                  color: "var(--app-text-muted)",
                  marginTop: upcoming.length > 0 ? "2rem" : 0,
                }}
              >
                Past
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {past.map((event) => (
                  <EventCard key={event._id} event={event} />
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {org.location && org.locationType !== "online" && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--app-text)" }}>
            Where
          </h2>
          <LocationMapCard location={org.location} coordinates={org.coordinates ?? undefined} />
        </section>
      )}
    </div>
  );
}

// Back to wherever they came from (an event, a profile), else the
// Organizations tab.
function BackLink() {
  const back = useBack("/people?tab=orgs");
  return (
    <Link
      {...back}
      className="inline-block text-sm font-medium mb-4 hover:underline"
      style={{ color: "var(--app-accent-ink)" }}
    >
      ← Back
    </Link>
  );
}

// Circular photo, or the first initial on the raised hairline — the same
// fallback a profile with no photo gets.
function Avatar({
  name,
  imageUrl,
  size,
}: {
  name: string;
  imageUrl: string | null;
  size: "sm" | "md";
}) {
  return (
    <div
      className={`${size === "md" ? "w-14 h-14 text-xl" : "w-9 h-9 text-sm"} rounded-full shrink-0 overflow-hidden flex items-center justify-center`}
      style={{ backgroundColor: "var(--app-hairline-raised)" }}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="font-medium" style={{ color: "var(--app-text-dim)" }}>
          {name.trim().charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

function PersonCard({ person, href }: { person: Person; href: string | null }) {
  const years = yearsLabel(person.startYear, person.endYear);
  const body = (
    <>
      <Avatar name={person.name} imageUrl={person.imageUrl} size="md" />
      <p
        className="mt-3 font-medium break-words max-w-full"
        style={{ color: "var(--app-text)" }}
      >
        {person.name}
      </p>
      {person.title && (
        <p className="mt-0.5 text-sm break-words max-w-full" style={{ color: "var(--app-text-muted)" }}>
          {person.title}
        </p>
      )}
      {years && (
        <p className="mt-1 text-xs" style={{ color: "var(--app-text-dim)" }}>
          {years}
        </p>
      )}
    </>
  );
  const className =
    "flex flex-col items-center text-center p-4 sm:p-5 rounded-2xl border transition-colors min-w-0";
  const style = {
    backgroundColor: "var(--app-surface-raised)",
    borderColor: "var(--app-hairline)",
  };
  return href ? (
    <Link to={href} className={`${className} hover:border-[var(--app-accent)]`} style={style}>
      {body}
    </Link>
  ) : (
    <div className={className} style={style}>
      {body}
    </div>
  );
}

function AlumniRow({ person, href }: { person: Person; href: string | null }) {
  const detail = [person.title, yearsLabel(person.startYear, person.endYear)]
    .filter(Boolean)
    .join(" · ");
  const body = (
    <>
      <Avatar name={person.name} imageUrl={person.imageUrl} size="sm" />
      <p className="text-sm min-w-0 break-words">
        <span className="font-medium" style={{ color: "var(--app-text)" }}>
          {person.name}
        </span>
        {detail && <span style={{ color: "var(--app-text-muted)" }}> · {detail}</span>}
      </p>
    </>
  );
  const className = "flex items-center gap-3 py-2.5";
  return href ? (
    <Link to={href} className={`${className} hover:underline`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
