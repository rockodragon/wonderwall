// A create flow (start a project, hire someone, host an event) open as one
// card on the desk: /today?create=project|hire|event. The form sits on the
// desk's own dotted
// surface (FocusBackdrop) with nothing from the list behind it. Closing it
// drops the param and the desk shows again.
//
// The forms are the ones the list pages use, mounted the same way:
//   project: routes/projects.tsx, ProjectModal in its start mode, and on
//            success go to the new project's page.
//   hire:    routes/projects.tsx, the Hire someone chooser (HireFlow: one job,
//            or a recurring gig), and on success go to the new posting's page.
//            "Start a project instead" swaps this card for the project one.
//   event:   routes/events.tsx, CreateEventModal, which goes to the new
//            event's page itself.
//
// Desk.tsx mounts this once and it takes no props. Hooks stay above every
// return.

import { useConvexAuth } from "convex/react";
import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { CreateEventModal } from "../components/CreateEventModal";
import { HireFlow } from "../components/HireFlow";
import { ProjectModal } from "../components/ProjectModal";
import { parseDeskCreate } from "./deskState";
import { loginHref } from "./paletteLogic";
import { justPublished } from "../lib/justPublished";

export function DeskCreate() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useConvexAuth();

  const kind = parseDeskCreate(searchParams.get("create"));
  // A project was just made and we are on our way to its page. ProjectModal
  // calls onClose right after onCreated, and dropping the param then would
  // pull the visitor back to the desk.
  const created = useRef(false);
  useEffect(() => {
    created.current = false;
  }, [kind]);

  // Signed out: log in and come back to this same URL. Replace this entry so
  // Back doesn't land on the form again. Wait out the token check first: until
  // it settles a signed-in member reads as signed out.
  const signedOut = kind !== null && !isLoading && !isAuthenticated;
  useEffect(() => {
    if (!signedOut) return;
    navigate(loginHref(location.pathname, location.search), { replace: true });
  }, [signedOut, navigate, location.pathname, location.search]);

  const close = useCallback(() => {
    if (created.current) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("create");
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  if (!kind || isLoading || !isAuthenticated || typeof document === "undefined") return null;

  const onCreated = (projectId: string) => {
    created.current = true;
    navigate(justPublished(`/projects/${projectId}`));
  };

  // Into <body>: the desk is its own stacking context, and the palette (z-40)
  // would otherwise sit above the card. Page modals cover it, so this does too.
  return createPortal(
    kind === "project" ? (
      <ProjectModal onClose={close} onCreated={onCreated} />
    ) : kind === "hire" ? (
      <HireFlow
        onClose={close}
        onCreated={onCreated}
        // Same page, other card: the param swaps and the filters stay.
        onSwitchToProject={() =>
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.set("create", "project");
              return next;
            },
            { replace: true },
          )
        }
      />
    ) : (
      <CreateEventModal onClose={close} />
    ),
    document.body,
  );
}
