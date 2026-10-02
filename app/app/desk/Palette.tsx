// The palette: one button in the lower-left corner that replaces the sidebar
// on desktop. Hover (or focus) it and six tools fan out on an arc; hover a
// tool and its stack of actions opens beside it. Spec:
// docs/features/desktop-desk-palette.md ("Palette") and the handoff README.
//
// It lives in the _app shell and never shares React state with the desk: it
// writes the URL (deskHref), the desk reads it.
//
// This file is the composition. The state machine (fan, stacks, roving
// tabindex, touch, keyboard) is usePaletteController.ts; the stack, chip,
// avatar and stylesheet are PaletteParts.tsx; the rules that don't need React
// are paletteLogic.ts; what's in each stack is paletteConfig.tsx.

import { Palette as PaletteGlyph } from "@phosphor-icons/react";
import { useLocation, useNavigate } from "react-router";
import { canCopyInvite, inviteRowLabel } from "../components/InviteCTA";
import { useReducedMotion } from "../hooks/useMediaQuery";
import { initialsOf } from "../lib/initials";
import { useShortlist } from "../lib/shortlist/useShortlist";
import { useInviteLink } from "../lib/useInviteLink";
import { useSignOut } from "../lib/useSignOut";
import { setDeskCommunity, useDeskCommunity, deskHref } from "./deskState";
import { buildSignedInTools, buildSignedOutTools, type PaletteTool } from "./paletteConfig";
import {
  Avatar,
  CountChip,
  Dot,
  MAIN_RING,
  MAIN_WASH,
  StackPanel,
  paletteCss,
} from "./PaletteParts";
import {
  PALETTE,
  activeToolId,
  badgeText,
  fanAngles,
  fanOffset,
  fanTransition,
  loginHref,
} from "./paletteLogic";
import { DESK, FOCUS_RING_CLASS, useDeskTint } from "./tokens";
import { usePaletteController } from "./usePaletteController";

export interface PaletteProfile {
  name?: string | null;
  imageUrl?: string | null;
  isAdmin?: boolean | null;
}

export interface PaletteProps {
  isAuthenticated: boolean;
  profile: PaletteProfile | null | undefined;
  /** Unread messages plus notifications. */
  badgeCount: number;
}

export function Palette({ isAuthenticated, profile, badgeCount }: PaletteProps) {
  return isAuthenticated ? (
    <SignedInPalette profile={profile} badgeCount={badgeCount} />
  ) : (
    <SignedOutPalette />
  );
}

function SignedInPalette({
  profile,
  badgeCount,
}: {
  profile: PaletteProfile | null | undefined;
  badgeCount: number;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const signOut = useSignOut();
  const community = useDeskCommunity();
  // The sidebar's invite row used this same hook; the palette replaces it.
  const invite = useInviteLink("palette");
  // Signed in only: this branch is the only one that subscribes. The one
  // shared hook, so the dot and the counts agree with the Shortlist itself.
  const shortlist = useShortlist();

  const tools = buildSignedInTools({
    profileName: profile?.name,
    imageUrl: profile?.imageUrl,
    initials: initialsOf(profile?.name),
    isAdmin: Boolean(profile?.isAdmin),
    badgeCount,
    community,
    active: activeToolId(location.pathname, location.search),
    shortlist:
      shortlist.status === "ready" ? { needs: shortlist.needs.length, summary: shortlist.summary } : null,
    invite: {
      label: inviteRowLabel(invite.copied),
      onSelect: () => {
        if (canCopyInvite(invite)) {
          void invite.copy();
          return "keep";
        }
        // No link to copy (still generating, or out of invites): the Network
        // tab says why and has the rest.
        navigate("/settings?tab=network");
      },
    },
    onSwitchCommunity: (next) => {
      setDeskCommunity(next);
      navigate(deskHref("all"));
    },
    onSignOut: () => void signOut(),
  });

  return (
    <PaletteShell
      tools={tools}
      badge={badgeCount}
      mainTitle="Desk"
      onMain={() => navigate(deskHref("all"))}
    />
  );
}

function SignedOutPalette() {
  const location = useLocation();
  const navigate = useNavigate();
  const tools = buildSignedOutTools({
    active: activeToolId(location.pathname, location.search),
    loginTo: loginHref(location.pathname, location.search),
  });
  return <PaletteShell tools={tools} badge={0} onMain={() => navigate("/garden")} />;
}

function PaletteShell({
  tools,
  badge,
  mainTitle,
  onMain,
}: {
  tools: PaletteTool[];
  /** Unread count for the main button. */
  badge: number;
  /** The main button's tooltip: signed in, it is the way back to the desk. */
  mainTitle?: string;
  onMain: () => void;
}) {
  const reduced = useReducedMotion();
  const pal = usePaletteController(tools, onMain);
  const { open, stackId, roving } = pal;

  const angles = fanAngles(tools.length);
  const mainBadge = badge > 0 ? badgeText(badge) : null;
  const centre = PALETTE.inset + PALETTE.button / 2;
  const half = PALETTE.tool / 2;

  const tint = useDeskTint();
  return (
    <div
      ref={pal.rootRef}
      className="desk-pal"
      onKeyDown={pal.onRootKeyDown}
      onBlur={pal.onRootBlur}
      // A zero-size anchor in the corner; everything inside is absolute. z-40:
      // above the desk and its opened card, below page modals (z-50).
      style={{ position: "fixed", left: 0, bottom: 0, width: 0, height: 0, zIndex: 40 }}
    >
      <style>{paletteCss(reduced)}</style>

      {/* The hover zone takes no pointer events until the fan is open, so it
          never blocks a click on the page underneath. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: PALETTE.zone,
          height: PALETTE.zone,
          pointerEvents: open ? "auto" : "none",
        }}
        onPointerEnter={pal.onZonePointerEnter}
        onPointerLeave={pal.onZonePointerLeave}
      >
        <button
          ref={pal.mainRef}
          type="button"
          aria-label="Navigation"
          title={mainTitle}
          aria-expanded={open}
          aria-describedby={mainBadge ? "desk-pal-unread" : undefined}
          data-pal-hit
          className={FOCUS_RING_CLASS}
          onPointerDown={pal.onMainPointerDown}
          onPointerEnter={pal.onMainPointerEnter}
          onClick={pal.onMainClick}
          onFocus={pal.onMainFocus}
          onKeyDown={pal.onMainKeyDown}
          style={{
            position: "absolute",
            left: PALETTE.inset,
            bottom: PALETTE.inset,
            width: PALETTE.button,
            height: PALETTE.button,
            borderRadius: "50%",
            border: `1px solid ${DESK.accent}`,
            // The handoff's faint accent wash, over an opaque base so the
            // icon still reads on a light page.
            background: `linear-gradient(${MAIN_WASH}, ${MAIN_WASH}), ${tint.surface}`,
            boxShadow: `0 0 0 6px ${MAIN_RING}`,
            color: DESK.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            padding: 0,
            zIndex: 10,
            pointerEvents: "auto",
          }}
        >
          <PaletteGlyph size={24} weight="regular" aria-hidden />
          {mainBadge && <CountChip text={mainBadge} offset={-5} />}
        </button>
        {mainBadge && (
          <span id="desk-pal-unread" className="sr-only">
            {badge} unread
          </span>
        )}

        {tools.map((tool, i) => {
          const { x, y } = fanOffset(angles[i]);
          const stackOpen = open && stackId === tool.id;
          const hasBadge = (tool.badge ?? 0) > 0;
          // The dot is read out as the main button's count is: a description.
          const dotId = tool.dot ? `desk-pal-dot-${tool.id}` : undefined;
          return (
            <div
              key={tool.id}
              data-pal-hit
              onPointerEnter={(e) => pal.onToolPointerEnter(e, tool)}
              onPointerLeave={pal.onToolPointerLeave}
              style={{
                position: "absolute",
                left: centre + x - half,
                bottom: centre + y - half,
                width: PALETTE.tool,
                height: PALETTE.tool,
                borderRadius: "50%",
                // Closed: back at the button, small and invisible.
                transform: open ? "none" : `translate(${-x}px, ${y}px) scale(.4)`,
                opacity: open ? 1 : 0,
                pointerEvents: open ? "auto" : "none",
                // Visible the moment the fan opens (so the keyboard can focus a
                // tool at once); only transform and opacity are staggered.
                visibility: open ? "visible" : "hidden",
                transition: fanTransition(open, i, reduced),
                zIndex: stackOpen ? 6 : 2,
              }}
            >
              <button
                ref={pal.toolRef(tool.id)}
                type="button"
                aria-label={tool.label}
                aria-haspopup="menu"
                aria-expanded={stackOpen}
                aria-current={tool.active ? "true" : undefined}
                aria-describedby={dotId}
                tabIndex={open && i === roving ? 0 : -1}
                className={`desk-pal-tool ${FOCUS_RING_CLASS}`}
                onPointerDown={pal.onToolPointerDown}
                onClick={(e) => pal.onToolClick(e, tool)}
                onKeyDown={(e) => pal.onToolKeyDown(e, i, tool)}
                onFocus={() => pal.setRoving(i)}
                style={{
                  position: "relative",
                  // Above the menu's bridge, which reaches in behind the button.
                  zIndex: 1,
                  width: PALETTE.tool,
                  height: PALETTE.tool,
                  borderRadius: "50%",
                  border: `1px solid ${tool.active ? DESK.accent : DESK.lineStrong}`,
                  color: tool.active ? DESK.accent : DESK.text,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {tool.avatar ? <Avatar {...tool.avatar} /> : tool.icon}
                {hasBadge && <CountChip text={badgeText(tool.badge ?? 0)} offset={-6} />}
                {tool.dot && <Dot />}
              </button>
              {tool.dot && (
                <span id={dotId} className="sr-only">
                  {tool.dot}
                </span>
              )}

              {stackOpen && (
                <div
                  data-pal-hit
                  data-stack={tool.id}
                  className="desk-pal-stack"
                  // The left padding is the bridge the cursor crosses: 28px, as
                  // tall as the menu. It starts 14px inside the tool's box
                  // (behind its button, which sits above it), so the empty
                  // corners of the circle are covered, and the menu stays 14px
                  // clear of the tool. The panel's bottom edge sits at the
                  // tool's centre, so it grows up and right, clear of the
                  // tools further round the arc. 8px of padding below it keeps
                  // the bridge under a cursor that leaves the circle just low
                  // of centre.
                  style={{
                    position: "absolute",
                    left: PALETTE.tool - PALETTE.bridge / 2,
                    bottom: half - 8,
                    paddingLeft: PALETTE.bridge,
                    paddingBottom: 8,
                    zIndex: 0,
                  }}
                >
                  <StackPanel
                    tool={tool}
                    onSelect={pal.selectItem}
                    onItemKeyDown={(e) => pal.onItemKeyDown(e, tool)}
                    onNavigate={() => pal.closeAll()}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
