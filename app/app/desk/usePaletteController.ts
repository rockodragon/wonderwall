// The palette's state machine: is the fan open, which tool's stack is showing,
// which tool holds the roving tabindex, and how mouse, touch and keyboard move
// between them. No markup here: Palette.tsx draws, this decides. Spec:
// docs/features/desktop-desk-palette.md ("Palette": hover, keyboard, touch).

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useNavigate } from "react-router";
import type { PaletteItem, PaletteTool } from "./paletteConfig";
import { createGrace, createHoverIntent, type ToolId } from "./paletteLogic";
import { isFocusVisible } from "./tokens";

const ARROW_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

/** The first row of a tool's open stack. */
function firstRow(root: HTMLElement | null, id: ToolId): HTMLElement | null {
  return root?.querySelector<HTMLElement>(`[data-stack="${id}"] [role="menuitem"]`) ?? null;
}

/**
 * @param tools   what's in the fan, in arc order
 * @param onMain  a click on the main button (mouse, or Enter/Space)
 */
export function usePaletteController(tools: PaletteTool[], onMain: () => void) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [stackId, setStackId] = useState<ToolId | null>(null);
  const [roving, setRoving] = useState(0);
  // The same value as stackId, readable by a pointer event before the next render.
  const stackRef = useRef<ToolId | null>(null);
  // The one wait behind mouse hover: a switch to a neighbouring tool, or a close.
  const [grace] = useState(() => createGrace());

  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLButtonElement>(null);
  const toolRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  // The mouse is inside the zone: a focus change must not close the fan.
  const hovering = useRef(false);
  // The kind of pointer behind the click that's about to arrive.
  const pointerKind = useRef("mouse");
  // Refocusing the main button after Escape must not reopen the fan.
  const skipFocusOpen = useRef(false);
  const focusStackOnOpen = useRef(false);
  const focusToolOnOpen = useRef<number | null>(null);

  /** Every change of stack goes through here, so a hover still waiting never
   *  lands on top of a newer choice (keyboard, click, close). */
  const showStack = useCallback(
    (id: ToolId | null) => {
      grace.cancel();
      stackRef.current = id;
      setStackId(id);
    },
    [grace],
  );

  const closeAll = useCallback((refocusMain = false) => {
    hovering.current = false;
    showStack(null);
    setOpen(false);
    if (refocusMain) {
      skipFocusOpen.current = true;
      mainRef.current?.focus();
      skipFocusOpen.current = false;
    }
  }, [showStack]);

  /** Keyboard focus is inside the palette (as opposed to a mouse that clicked there). */
  function keyboardFocusInside(): boolean {
    const el = document.activeElement;
    return !!el && !!rootRef.current?.contains(el) && isFocusVisible(el);
  }

  // What the mouse does to the menus, with a 300ms grace before a switch or a
  // close (paletteLogic: createHoverIntent). It only touches refs, so the
  // first render's functions are good for the life of the palette.
  const [intent] = useState(() =>
    createHoverIntent(
      { current: () => stackRef.current, showStack, closeAll: () => closeAll(), keepOpen: keyboardFocusInside },
      grace,
    ),
  );
  useEffect(() => () => grace.cancel(), [grace]);

  // Tap outside closes everything (touch, or a click anywhere off the palette).
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      const target = e.target as Element | null;
      if (target?.closest?.("[data-pal-hit]")) return;
      const inside = !!target && !!rootRef.current?.contains(target);
      if (!inside || e.pointerType === "touch") closeAll();
    }
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open, closeAll]);

  // Keyboard hand-offs that have to wait for the render that shows the target.
  // The tools are focusable from the commit that opens the fan: their wrappers
  // flip to visible at once (fanTransition), only opacity and transform wait.
  useEffect(() => {
    if (open && focusToolOnOpen.current !== null) {
      const target = tools[focusToolOnOpen.current];
      focusToolOnOpen.current = null;
      if (target) toolRefs.current[target.id]?.focus();
    }
  }, [open, tools]);
  useEffect(() => {
    if (stackId && focusStackOnOpen.current) {
      focusStackOnOpen.current = false;
      firstRow(rootRef.current, stackId)?.focus();
    }
  }, [stackId]);

  function focusTool(i: number) {
    const next = Math.max(0, Math.min(tools.length - 1, i));
    setRoving(next);
    showStack(null);
    toolRefs.current[tools[next].id]?.focus();
  }

  function openStackWithKeyboard(id: ToolId) {
    if (stackId === id) {
      firstRow(rootRef.current, id)?.focus();
      return;
    }
    focusStackOnOpen.current = true;
    showStack(id);
  }

  // ——— main button ———

  function onMainPointerDown(e: ReactPointerEvent) {
    pointerKind.current = e.pointerType;
  }

  function onMainPointerEnter(e: ReactPointerEvent) {
    if (e.pointerType === "touch") return;
    hovering.current = true;
    intent.zoneEnter();
    setOpen(true);
  }

  function onMainClick(e: ReactMouseEvent) {
    // detail 0 is Enter/Space (or a scripted click): keyboard, never touch.
    if (pointerKind.current === "touch" && e.detail !== 0) {
      if (open) closeAll();
      else setOpen(true);
      return;
    }
    onMain();
  }

  function onMainFocus() {
    if (skipFocusOpen.current) return;
    // A mouse click focuses the button too; only keyboard focus opens the fan.
    if (isFocusVisible(mainRef.current)) setOpen(true);
  }

  function onMainKeyDown(e: ReactKeyboardEvent) {
    if (!ARROW_KEYS.includes(e.key)) return;
    e.preventDefault();
    const target = tools[roving];
    if (open) {
      if (target) toolRefs.current[target.id]?.focus();
    } else {
      focusToolOnOpen.current = roving;
      setOpen(true);
    }
  }

  // ——— the hover zone ———

  function onZonePointerEnter(e: ReactPointerEvent) {
    if (e.pointerType === "touch") return;
    hovering.current = true;
    intent.zoneEnter();
  }

  function onZonePointerLeave(e: ReactPointerEvent) {
    if (e.pointerType === "touch") return;
    hovering.current = false;
    intent.zoneLeave();
  }

  // ——— tools ———

  function onToolPointerEnter(e: ReactPointerEvent, tool: PaletteTool) {
    if (e.pointerType !== "touch") intent.toolEnter(tool.id);
  }

  function onToolPointerLeave(e: ReactPointerEvent) {
    if (e.pointerType !== "touch") intent.toolLeave();
  }

  function onToolPointerDown(e: ReactPointerEvent) {
    pointerKind.current = e.pointerType;
  }

  function onToolClick(e: ReactMouseEvent, tool: PaletteTool) {
    // detail 0 is a click with no pointer behind it: Space on some browsers, or
    // a screen reader's "activate". Treat it as Enter: open the stack.
    if (e.detail === 0) {
      openStackWithKeyboard(tool.id);
      return;
    }
    if (pointerKind.current === "touch") {
      // First tap shows the stack; the second runs the tool.
      if (stackId !== tool.id) {
        showStack(tool.id);
        return;
      }
      if (tool.to) {
        navigate(tool.to);
        closeAll();
      }
      return;
    }
    if (tool.to) navigate(tool.to);
  }

  function onToolKeyDown(e: ReactKeyboardEvent, i: number, tool: PaletteTool) {
    switch (e.key) {
      case "ArrowUp":
      case "ArrowLeft":
        e.preventDefault();
        focusTool(i - 1);
        break;
      case "ArrowDown":
      case "ArrowRight":
        e.preventDefault();
        focusTool(i + 1);
        break;
      case "Home":
        e.preventDefault();
        focusTool(0);
        break;
      case "End":
        e.preventDefault();
        focusTool(tools.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        openStackWithKeyboard(tool.id);
        break;
    }
  }

  // ——— stack rows ———

  function onItemKeyDown(e: ReactKeyboardEvent<HTMLElement>, tool: PaletteTool) {
    const menu = e.currentTarget.closest('[role="menu"]');
    const rows = menu ? Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')) : [];
    const at = rows.indexOf(e.currentTarget);
    const go = (i: number) => {
      e.preventDefault();
      rows[(i + rows.length) % rows.length]?.focus();
    };
    switch (e.key) {
      case "ArrowDown":
        go(at + 1);
        break;
      case "ArrowUp":
        go(at - 1);
        break;
      case "Home":
        go(0);
        break;
      case "End":
        go(rows.length - 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        showStack(null);
        toolRefs.current[tool.id]?.focus();
        break;
    }
  }

  function selectItem(item: PaletteItem) {
    const result = item.onSelect?.();
    if (result !== "keep") closeAll();
  }

  // ——— root ———

  function onRootKeyDown(e: ReactKeyboardEvent) {
    if (e.key !== "Escape") return;
    if (!stackId && !open) return; // Nothing of ours to close: the desk may have it.
    // Ours to close. preventDefault is the desk's cue (it checks
    // e.defaultPrevented) to leave its opened card alone.
    e.preventDefault();
    e.stopPropagation();
    if (stackId) {
      const id = stackId;
      showStack(null);
      toolRefs.current[id]?.focus();
    } else {
      closeAll(true);
    }
  }

  function onRootBlur(e: ReactFocusEvent) {
    if (rootRef.current?.contains(e.relatedTarget as Node | null)) return;
    if (!hovering.current) closeAll();
  }

  return {
    open,
    stackId,
    roving,
    rootRef,
    mainRef,
    /** The ref callback for a tool's button. */
    toolRef: (id: ToolId) => (el: HTMLButtonElement | null) => {
      toolRefs.current[id] = el;
    },
    closeAll,
    setRoving,
    onRootKeyDown,
    onRootBlur,
    onZonePointerEnter,
    onZonePointerLeave,
    onMainPointerDown,
    onMainPointerEnter,
    onMainClick,
    onMainFocus,
    onMainKeyDown,
    onToolPointerEnter,
    onToolPointerLeave,
    onToolPointerDown,
    onToolClick,
    onToolKeyDown,
    onItemKeyDown,
    selectItem,
  };
}
