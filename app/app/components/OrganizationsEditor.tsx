import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ORG_LIMITS, orgNameKey } from "../../convex/organizationRules";
import { OrgLogo } from "./OrgLogo";

// Settings › Profile: the organizations on your profile
// (docs/features/organizations.md). Every change saves on its own — like
// the old Organization field, it never rides along with the profile's Save.

type Mine = NonNullable<ReturnType<typeof useQuery<typeof api.organizations.mine>>>[number];

const INPUT =
  "w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-[var(--app-accent)] focus:border-transparent";
const INPUT_STYLE = {
  borderColor: "var(--app-hairline)",
  backgroundColor: "var(--app-surface-raised)",
  color: "var(--app-text)",
} as const;

function reasonOf(err: unknown): string {
  const reason = err instanceof ConvexError ? (err.data as { reason?: string } | null)?.reason : undefined;
  return reason || "That didn't save. Try again.";
}

export function OrganizationsEditor() {
  const mine = useQuery(api.organizations.mine);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const results = useQuery(api.organizations.search, query.trim() ? { q: query } : "skip");
  const addByName = useMutation(api.organizations.addByName);
  const join = useMutation(api.organizations.join);
  const reorder = useMutation(api.organizations.reorderMine);

  const myIds = new Set((mine ?? []).map((o) => String(o.organizationId)));
  const matches = (results ?? []).filter((r) => !myIds.has(String(r._id)));
  const typed = query.trim();
  const exact = (results ?? []).some((r) => r.nameKey === orgNameKey(typed));
  const current = (mine ?? []).filter((o) => o.current);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setQuery("");
    } catch (err) {
      setError(reasonOf(err));
    } finally {
      setBusy(false);
    }
  }

  function moveUp(id: Id<"organizations">) {
    const ids = current.map((o) => o.organizationId);
    const i = ids.indexOf(id);
    if (i <= 0) return;
    [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
    void run(() => reorder({ organizationIds: ids }));
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-2" style={{ color: "var(--app-text-muted)" }}>
        Organizations
      </label>

      {mine && mine.length > 0 && (
        <ul className="space-y-2 mb-3">
          {mine.map((o) => (
            <PositionRow
              key={o.organizationId}
              position={o}
              canMoveUp={o.current && current[0]?.organizationId !== o.organizationId}
              onMoveUp={() => moveUp(o.organizationId)}
              onError={setError}
            />
          ))}
        </ul>
      )}

      <div className="relative">
        <input
          type="text"
          value={query}
          maxLength={ORG_LIMITS.name}
          disabled={busy}
          placeholder="Add an organization"
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[var(--app-accent)] focus:border-transparent"
          style={INPUT_STYLE}
        />
        {typed && (
          <ul
            className="absolute z-20 left-0 right-0 mt-1 rounded-lg border shadow-lg overflow-hidden"
            style={{ backgroundColor: "var(--app-surface-raised)", borderColor: "var(--app-hairline)" }}
          >
            {matches.map((r) => (
              <li key={r._id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => join({ organizationId: r._id }))}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-[var(--app-hairline)]"
                >
                  <OrgLogo name={r.name} logoUrl={r.logoUrl} size="sm" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate" style={{ color: "var(--app-text)" }}>
                      {r.name}
                    </span>
                    {(r.category || r.location) && (
                      <span className="block text-xs truncate" style={{ color: "var(--app-text-dim)" }}>
                        {[r.category, r.location].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
            {!exact && results !== undefined && (
              <li>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => addByName({ name: typed }))}
                  className="w-full px-3 py-2.5 text-left text-sm font-medium hover:bg-[var(--app-hairline)]"
                  style={{ color: "var(--app-accent-ink)" }}
                >
                  + Add “{typed}”
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-400">{error}</p>
      )}
      <p className="mt-1 text-sm" style={{ color: "var(--app-text-dim)" }}>
        The first one shows with your name on events you host.
      </p>
    </div>
  );
}

function yearValue(raw: string): number | null {
  const n = Number(raw.trim());
  return raw.trim() && Number.isFinite(n) ? n : null;
}

function PositionRow({
  position,
  canMoveUp,
  onMoveUp,
  onError,
}: {
  position: Mine;
  canMoveUp: boolean;
  onMoveUp: () => void;
  onError: (msg: string | null) => void;
}) {
  const update = useMutation(api.organizations.updateMyPosition);
  const leave = useMutation(api.organizations.leave);
  const [title, setTitle] = useState(position.title ?? "");
  const [start, setStart] = useState(position.startYear ? String(position.startYear) : "");
  const [end, setEnd] = useState(position.endYear ? String(position.endYear) : "");

  // Re-seed when the server copy changes (another tab, a refusal).
  useEffect(() => {
    setTitle(position.title ?? "");
    setStart(position.startYear ? String(position.startYear) : "");
    setEnd(position.endYear ? String(position.endYear) : "");
  }, [position.title, position.startYear, position.endYear]);

  async function save() {
    const next = { title: title.trim(), startYear: yearValue(start), endYear: yearValue(end) };
    if (
      next.title === (position.title ?? "") &&
      next.startYear === position.startYear &&
      next.endYear === position.endYear
    ) {
      return;
    }
    onError(null);
    try {
      await update({ organizationId: position.organizationId, ...next });
    } catch (err) {
      onError(reasonOf(err));
      setTitle(position.title ?? "");
      setStart(position.startYear ? String(position.startYear) : "");
      setEnd(position.endYear ? String(position.endYear) : "");
    }
  }

  async function remove() {
    if (!window.confirm(`Take ${position.name} off your profile?`)) return;
    onError(null);
    try {
      await leave({ organizationId: position.organizationId });
    } catch (err) {
      onError(reasonOf(err));
    }
  }

  return (
    <li
      className="p-3 rounded-xl border"
      style={{ borderColor: "var(--app-hairline)", backgroundColor: "var(--app-surface-raised)" }}
    >
      <div className="flex items-center gap-3">
        <OrgLogo name={position.name} logoUrl={position.logoUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <Link
            to={`/orgs/${position.slug}`}
            className="block text-sm font-medium truncate hover:underline"
            style={{ color: "var(--app-text)" }}
          >
            {position.name}
          </Link>
          {position.isAdmin && (
            <Link
              to={`/orgs/${position.slug}/edit`}
              className="text-xs hover:underline"
              style={{ color: "var(--app-accent-ink)" }}
            >
              Edit page
            </Link>
          )}
        </div>
        {canMoveUp && (
          <button
            type="button"
            onClick={onMoveUp}
            aria-label={`Move ${position.name} up`}
            title="Move up"
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg border hover:border-[var(--app-accent)]"
            style={{ borderColor: "var(--app-hairline)", color: "var(--app-text-muted)" }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>
        )}
        <button
          type="button"
          onClick={remove}
          className="text-sm px-2 py-1 rounded-lg hover:bg-[var(--app-hairline)]"
          style={{ color: "var(--app-text-muted)" }}
        >
          Remove
        </button>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_5.5rem_5.5rem] gap-2">
        <input
          type="text"
          value={title}
          maxLength={ORG_LIMITS.title}
          placeholder="Title"
          aria-label={`Your title at ${position.name}`}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={save}
          className={INPUT}
          style={INPUT_STYLE}
        />
        <input
          type="text"
          inputMode="numeric"
          value={start}
          maxLength={4}
          placeholder="Since"
          aria-label="Start year"
          onChange={(e) => setStart(e.target.value.replace(/\D/g, ""))}
          onBlur={save}
          className={INPUT}
          style={INPUT_STYLE}
        />
        <input
          type="text"
          inputMode="numeric"
          value={end}
          maxLength={4}
          placeholder="Until"
          aria-label="End year, if you've left"
          onChange={(e) => setEnd(e.target.value.replace(/\D/g, ""))}
          onBlur={save}
          className={INPUT}
          style={INPUT_STYLE}
        />
      </div>
    </li>
  );
}
