// A project opened on the Canvas (Rick, 2026-11-05) opens as its own page over
// the grid, the way a post opens over the grid on Instagram. Before, it opened
// as a card that sent you on to the page with "See project". Now one click
// shows the work, the story and every way to join in, and the grid waits
// behind it, where it was. X, Escape, Back, or a click beside the page
// closes it. The arrows (and ← →) go to the project before or after it in
// the grid.
//
// The page is the project page itself (routes/projects.$id.tsx ProjectView),
// so it is never a second copy to keep in step. Its code loads once, the first
// time a project opens, or earlier (preloadProjectPage) while project cards
// are on show. Its section tabs live in the page, because the Canvas's
// address has a ?tab= of its own.

import { Suspense, lazy, useEffect, useRef } from "react";
import { CaretLeft, CaretRight, X } from "@phosphor-icons/react";
import { useReducedMotion } from "../hooks/useMediaQuery";
import { isTyping, PALETTE_SELECTOR } from "./deskKeys";
import { Z_PAGE } from "./deskLayout";
import { ROUND_CLASS } from "./OpenedCard";
import { DESK } from "./tokens";

const loadPage = () => import("../routes/projects.$id");
const ProjectView = lazy(() => loadPage().then((m) => ({ default: m.ProjectView })));

/** Fetches the page's code ahead of the first click. */
export function preloadProjectPage(): void {
  void loadPage();
}

/** The page's own width (PAGE_WIDTH.reading, max-w-3xl), and the room each
 *  arrow takes beside it. */
const PAGE_W = 768;
const ARROW_ROOM = 76;

export function ProjectOverlay({
  projectId,
  onClose,
  onPrev,
  onNext,
}: {
  projectId: string;
  onClose: () => void;
  /** To the project before or after this one in the grid; none at an end. */
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // The keys reach this page while it is up, but not the grid behind it.
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  // Each project starts at its top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [projectId]);

  const keys = useRef({ onClose, onPrev, onNext });
  keys.current = { onClose, onPrev, onNext };
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return;
      // Something the page opened is on top (Theater, the edit form, the
      // support sheet, a menu), and the keys are its own.
      if (document.querySelector('[aria-modal="true"]:not([data-project-overlay])')) return;
      if (panelRef.current?.querySelector(".fixed")) return;
      if (e.target instanceof Element && e.target.closest(`${PALETTE_SELECTOR}, [role="menu"]`)) return;
      const { onClose, onPrev, onNext } = keys.current;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.shiftKey || isTyping(e.target)) return;
      // The section tabs, a player's seek bar: arrows that are theirs.
      if (e.target instanceof Element && e.target.closest('[role="tablist"], [role="slider"], audio, video')) return;
      const go = e.key === "ArrowLeft" ? onPrev : onNext;
      if (!go) return;
      e.preventDefault();
      go();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const arrowX = `max(16px, calc(50% - ${PAGE_W / 2 + ARROW_ROOM}px))`;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Project"
      tabIndex={-1}
      data-project-overlay
      style={{ position: "absolute", inset: 0, zIndex: Z_PAGE, outline: "none" }}
    >
      <style>{KEYFRAMES}</style>
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(10,10,10,.8)",
          animation: reduced ? "none" : "project-over-dim 220ms ease both",
        }}
      />

      {/* Scrolls on its own, so a long page reads top to bottom over the
          still grid. A click on the dark beside the page closes it. */}
      <div
        ref={scrollRef}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        style={{
          position: "absolute",
          inset: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: `48px ${ARROW_ROOM + 24}px`,
        }}
      >
        <div
          ref={panelRef}
          className="w-full max-w-3xl rounded-2xl"
          style={{
            // The page's ground. Its tokens arrive with the page (/tokens.css),
            // so the first time the desk's own page color stands in, the same one.
            backgroundColor: `var(--garden-ink, ${DESK.page})`,
            // Centered when it is shorter than the window, from the top when longer.
            marginBlock: "auto",
            boxShadow: "0 24px 80px rgba(0,0,0,.55)",
            // `backwards`: no transform once it has arrived, so the page's own
            // full-screen sheets (position: fixed) still cover the window.
            animation: reduced ? "none" : `project-over-rise 340ms ${DESK.ease} backwards`,
          }}
        >
          {/* Empty for the moment the page's code takes to arrive, the
              first time; then the page shows its own loading. */}
          <Suspense fallback={<div style={{ minHeight: 320 }} />}>
            <ProjectView key={projectId} projectId={projectId} over />
          </Suspense>
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className={ROUND_CLASS}
        style={{ position: "absolute", top: 20, right: 24, backgroundColor: DESK.panel }}
      >
        <X size={18} weight="regular" aria-hidden />
      </button>
      {onPrev && (
        <button
          type="button"
          onClick={onPrev}
          aria-label="Previous project"
          className={ROUND_CLASS}
          style={{ position: "absolute", top: "50%", left: arrowX, transform: "translateY(-50%)", backgroundColor: DESK.panel }}
        >
          <CaretLeft size={18} weight="regular" aria-hidden />
        </button>
      )}
      {onNext && (
        <button
          type="button"
          onClick={onNext}
          aria-label="Next project"
          className={ROUND_CLASS}
          style={{ position: "absolute", top: "50%", right: arrowX, transform: "translateY(-50%)", backgroundColor: DESK.panel }}
        >
          <CaretRight size={18} weight="regular" aria-hidden />
        </button>
      )}
    </div>
  );
}

const KEYFRAMES = `
@keyframes project-over-dim { from { opacity: 0 } to { opacity: 1 } }
@keyframes project-over-rise { from { opacity: 0; transform: translateY(18px) } to { opacity: 1; transform: none } }
`;
