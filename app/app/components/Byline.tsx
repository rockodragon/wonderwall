// "By" a person or an organization: a round avatar for a person, a square
// logo for an organization, then the name. `size="sm"` is a project card's
// line; `md` is the project page's, where it links to them. `post` is a feed
// post's header (Today): a 36px rounded square for a person or an
// organization, the name on one line and `children` on the next. `children`
// otherwise goes after the name (the community: " · in The Garden").
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { ProjectByline } from "../lib/byline";
import { OrgLogo } from "./OrgLogo";
import { PersonAvatar } from "./PersonAvatar";

export function Byline({
  byline,
  size = "md",
  linked = false,
  children,
}: {
  byline: ProjectByline;
  size?: "sm" | "md" | "post";
  linked?: boolean;
  children?: ReactNode;
}) {
  const { kind, name, imageUrl } = byline;
  if (size === "post") {
    const face = <PersonAvatar name={name} imageUrl={imageUrl} size="row" tone="strong" shape="tile" />;
    const lines = (
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold leading-snug break-words" style={{ color: "var(--app-text)" }}>
          {name}
        </span>
        {children && (
          <span className="block text-[13px] leading-snug" style={{ color: "var(--app-text-muted)" }}>
            {children}
          </span>
        )}
      </span>
    );
    // py-1 makes the header a 44px target around the 36px square.
    return linked ? (
      <Link to={byline.href} className="flex items-center gap-3 w-fit max-w-full py-1 hover:opacity-80">
        {face}
        {lines}
      </Link>
    ) : (
      <div className="flex items-center gap-3 min-w-0 py-1">
        {face}
        {lines}
      </div>
    );
  }
  const face =
    kind === "person" ? (
      <PersonAvatar name={name} imageUrl={imageUrl} size={size === "sm" ? "2xs" : "xs"} tone="garden" />
    ) : size === "sm" ? (
      <PersonAvatar name={name} imageUrl={imageUrl} size="2xs" tone="garden" shape="square" />
    ) : (
      <OrgLogo name={name} logoUrl={imageUrl} size="xs" />
    );
  // Names are never truncated on a card — it wraps to fit instead.
  const label = (
    <span className={size === "sm" ? "text-xs break-words" : "text-sm"} style={{ color: "var(--garden-muted)" }}>
      {name}
      {children}
    </span>
  );
  return linked ? (
    <Link to={byline.href} className="flex items-center gap-2 w-fit hover:opacity-80">
      {face}
      {label}
    </Link>
  ) : (
    <div className="flex items-center gap-2 min-w-0">
      {face}
      {label}
    </div>
  );
}
