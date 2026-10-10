// "By" a person or an organization: a round avatar for a person, a square
// logo for an organization, then the name. `size="sm"` is a project card's
// line; `md` is the project page's, where it links to them. `children` goes
// after the name (the community: " · in The Garden").
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
  size?: "sm" | "md";
  linked?: boolean;
  children?: ReactNode;
}) {
  const { kind, name, imageUrl } = byline;
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
