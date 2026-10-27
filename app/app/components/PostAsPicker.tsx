// "Posted by": you, or an organization you're part of. An organization posts
// through a person — whoever runs the project — so nobody needs a separate
// login for their organization (Rick, 2026-10-10: Abiding Practice had one,
// and it looked like a person). Shows nothing for someone in no
// organization, so most people never see it.

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { gardenField } from "./gardenField";

export function PostAsPicker({
  value,
  onChange,
  roomy,
}: {
  /** The organization's id, or "" for the person themselves. */
  value: string;
  onChange: (organizationId: string) => void;
  /** The phone-sized look of the start-a-project sheet (gardenField.ts). */
  roomy?: boolean;
}) {
  const orgs = useQuery(api.organizations.mine);
  const me = useQuery(api.profiles.getMyProfile);
  const current = (orgs ?? []).filter((o) => o.current);
  if (current.length === 0) return null;

  const choices = [{ id: "", name: me?.name ?? "You" }, ...current.map((o) => ({ id: String(o.organizationId), name: o.name }))];
  return (
    <div>
      <div
        className={roomy ? gardenField.label : "block text-xs uppercase tracking-[0.06em] mb-1.5"}
        style={{ color: "var(--garden-dim)" }}
      >
        Posted by
      </div>
      <div role="radiogroup" aria-label="Posted by" className="flex flex-wrap gap-2">
        {choices.map((c) => {
          const selected = c.id === value;
          return (
            <button
              key={c.id || "me"}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(c.id)}
              className={`${roomy ? "px-4 py-2" : "px-3 py-1.5"} rounded-full border font-medium`}
              style={{
                fontSize: roomy ? 14 : 13.5,
                ...(selected
                  ? { backgroundColor: "var(--garden-citron)", borderColor: "var(--garden-citron)", color: "var(--garden-ink)" }
                  : { borderColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" }),
              }}
            >
              {c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
