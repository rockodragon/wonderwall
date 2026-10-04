import { PersonAvatar } from "./PersonAvatar";

export type PersonFace = { name: string; imageUrl?: string | null };

/** Show the actual people represented by a count, capped to the faces supplied by the API. */
export function PeopleFaces({
  faces,
  count,
}: {
  faces: readonly PersonFace[];
  count: number;
}) {
  if (count <= 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {faces.slice(0, 3).map((person, index) => (
          <li key={`${person.name}-${index}`} className="inline-flex items-center gap-1.5">
            <PersonAvatar name={person.name} imageUrl={person.imageUrl} size="sm" />
            <span className="max-w-32 truncate text-xs" style={{ color: "var(--app-text-muted)" }}>
              {person.name}
            </span>
          </li>
        ))}
      </ul>
      <span className="text-xs whitespace-nowrap" style={{ color: "var(--app-text-dim)" }}>
        {count} {count === 1 ? "person" : "people"}
      </span>
    </div>
  );
}
