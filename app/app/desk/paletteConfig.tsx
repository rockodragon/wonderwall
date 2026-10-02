// What the palette holds: its tools, and the rows in each tool's stack. The
// copy here is exact (docs/features/desktop-desk-palette.md, "Stacks"). Palette.tsx
// draws it; nothing in this file touches the DOM.

import type { ReactNode } from "react";
import {
  CalendarBlank,
  PaintBrush,
  PersonSimple,
  SignIn,
  SquaresFour,
  Sun,
} from "@phosphor-icons/react";
import {
  COMMUNITY_LABEL,
  deskHref,
  otherCommunity,
  type DeskCommunity,
} from "./deskState";
import { badgeText, type ToolId } from "./paletteLogic";

const TOOL_ICON_SIZE = 19;

export interface PaletteItem {
  id: string;
  label: string;
  /** A destination: the row is a link. */
  to?: string;
  /** An action: the row is a button. Return "keep" to leave the palette open. */
  onSelect?: () => "keep" | void;
  /** Right-aligned, muted (the unread count on "Read messages"). */
  trailing?: string;
}

export interface PaletteTool {
  id: ToolId;
  /** The tool's accessible name. */
  label: string;
  /** The stack's header. Drawn uppercase. */
  header: string;
  icon?: ReactNode;
  avatar?: { imageUrl?: string | null; initials: string };
  active: boolean;
  /** Where a click (or a second tap) goes. Absent: the click only opens the stack. */
  to?: string;
  items: PaletteItem[];
  /** Unread count chip on the tool. */
  badge?: number;
}

// ——————————————————————————————————————————————————————————————
// Signed in: Desk, Today, People, Projects, Events, Profile
// ——————————————————————————————————————————————————————————————

export interface SignedInDeps {
  profileName?: string | null;
  imageUrl?: string | null;
  initials: string;
  isAdmin: boolean;
  badgeCount: number;
  community: DeskCommunity;
  active: ToolId | null;
  /** The invite row: its label, and what selecting it does. */
  invite: { label: string; onSelect: () => "keep" | void };
  onSwitchCommunity: (next: DeskCommunity) => void;
  onSignOut: () => void;
}

export function buildSignedInTools(d: SignedInDeps): PaletteTool[] {
  const other = otherCommunity(d.community);
  const isActive = (id: ToolId) => d.active === id;

  const profileItems: PaletteItem[] = [
    { id: "edit", label: "Edit my profile", to: "/settings" },
    {
      id: "messages",
      label: "Read messages",
      to: "/messages",
      trailing: d.badgeCount > 0 ? badgeText(d.badgeCount) : undefined,
    },
    {
      id: "about",
      label: `About ${COMMUNITY_LABEL[d.community]}`,
      to: d.community === "garden" ? "/garden" : "/about",
    },
    {
      id: "switch",
      label: `Switch to ${COMMUNITY_LABEL[other]}`,
      onSelect: () => d.onSwitchCommunity(other),
    },
  ];
  if (d.isAdmin) profileItems.push({ id: "admin", label: "Admin", to: "/admin" });
  profileItems.push({ id: "signout", label: "Sign out", onSelect: d.onSignOut });

  return [
    {
      id: "desk",
      label: "Desk",
      header: "Desk",
      icon: <SquaresFour size={TOOL_ICON_SIZE} weight="regular" />,
      active: isActive("desk"),
      to: deskHref("all"),
      items: [{ id: "all", label: "Show everything", to: deskHref("all") }],
    },
    {
      id: "today",
      label: "Today",
      header: "Today",
      icon: <Sun size={TOOL_ICON_SIZE} weight="regular" />,
      active: isActive("today"),
      to: deskHref("today"),
      items: [{ id: "today", label: "Today", to: deskHref("today") }],
    },
    {
      id: "people",
      label: "People",
      header: "People",
      icon: <PersonSimple size={TOOL_ICON_SIZE} weight="regular" />,
      active: isActive("people"),
      to: deskHref("people"),
      items: [
        { id: "find", label: "Find people", to: deskHref("people") },
        { id: "near", label: "Meet people near me", to: `${deskHref("people")}&near=1` },
        { id: "invite", label: d.invite.label, onSelect: d.invite.onSelect },
      ],
    },
    {
      id: "projects",
      label: "Projects",
      header: "Projects",
      icon: <PaintBrush size={TOOL_ICON_SIZE} weight="regular" />,
      active: isActive("projects"),
      to: deskHref("projects"),
      items: [
        { id: "browse", label: "Browse projects", to: deskHref("projects") },
        { id: "start", label: "Start a project", to: deskHref("projects", null, "project") },
        { id: "hire", label: "Hire someone", to: deskHref("projects", null, "hire") },
        { id: "fund", label: "Grant Fund", to: deskHref("projects", "fund") },
      ],
    },
    {
      id: "events",
      label: "Events",
      header: "Events",
      icon: <CalendarBlank size={TOOL_ICON_SIZE} weight="regular" />,
      active: isActive("events"),
      to: deskHref("events"),
      items: [
        { id: "browse", label: "Browse events", to: deskHref("events") },
        { id: "host", label: "Host an event", to: deskHref("events", null, "event") },
        { id: "fav", label: "See my favorites", to: deskHref("fav") },
      ],
    },
    {
      id: "profile",
      label: "Profile",
      header: d.profileName?.trim() || "Profile",
      avatar: { imageUrl: d.imageUrl, initials: d.initials },
      active: isActive("profile"),
      badge: d.badgeCount,
      items: profileItems,
    },
  ];
}

// ——————————————————————————————————————————————————————————————
// Signed out: People, Projects, Events, Sign in
// ——————————————————————————————————————————————————————————————

export interface SignedOutDeps {
  active: ToolId | null;
  /** Login, back to the page they're on. */
  loginTo: string;
}

export function buildSignedOutTools(d: SignedOutDeps): PaletteTool[] {
  // The in-shell pages, all public (_app.tsx isPublicPathname), so the
  // palette stays put. NAV_ITEMS' publicTo pages (/opportunities,
  // /garden/events) sit outside the shell and would drop it.
  const people = "/people";
  const projects = "/projects";
  const events = "/events";
  return [
    {
      id: "people",
      label: "People",
      header: "People",
      icon: <PersonSimple size={TOOL_ICON_SIZE} weight="regular" />,
      active: d.active === "people",
      to: people,
      items: [{ id: "find", label: "Find people", to: people }],
    },
    {
      id: "projects",
      label: "Projects",
      header: "Projects",
      icon: <PaintBrush size={TOOL_ICON_SIZE} weight="regular" />,
      active: d.active === "projects",
      to: projects,
      items: [{ id: "browse", label: "Browse projects", to: projects }],
    },
    {
      id: "events",
      label: "Events",
      header: "Events",
      icon: <CalendarBlank size={TOOL_ICON_SIZE} weight="regular" />,
      active: d.active === "events",
      to: events,
      items: [{ id: "browse", label: "Browse events", to: events }],
    },
    {
      id: "signin",
      label: "Sign in",
      header: "Sign in",
      icon: <SignIn size={TOOL_ICON_SIZE} weight="regular" />,
      active: false,
      to: d.loginTo,
      items: [
        { id: "signin", label: "Sign in", to: d.loginTo },
        { id: "about", label: "About The Garden", to: "/garden" },
      ],
    },
  ];
}
