// The Garden's mark, from Claude Design's "Garden Brand" (Turns 5–7) and the
// brand kit's README:
//
//   G       one clean stroke, on a 32-unit square
//   Disc    a crimson circle with the G cut out (the ground shows through)
//   Lockup  the disc beside "The Garden" in Jost Medium: the disc is 1.25×
//           the font size, the gap a quarter of the disc. Title case, never
//           all caps.
//   Grow    a sprout comes up, curls into the G, and the disc swells in
//           behind it. Only on The Garden's own page, at most once a day on
//           a device, and not at all under reduced motion (UX review,
//           2026-10-03: not on the desk, where it would play all day).
//
// Crimson is for the mark only, never for text: on the dark site it holds
// about 4.2:1, under the floor for words. When the member artist draws the
// final G, GARDEN_G_PATH is the one line to change (and the files in
// public/brand/garden/).

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { GARDEN } from "./brands";

export const GARDEN_G_PATH =
  "M23.4 10.4C21.7 8.3 19.1 7 16.2 7C10.8 7 6.6 11.2 6.6 16.5C6.6 21.8 10.8 26 16.2 26C21.2 26 25.2 22.3 25.4 17.2C22.6 17.2 19.8 17.2 17 17.2";
/** The G inside the disc: smaller, heavier, a touch lower. */
const IN_DISC = "translate(16 16) scale(0.66) translate(-16 -16.5)";

type Ground = "dark" | "paper";
const crimsonOn = (ground: Ground) => (ground === "dark" ? GARDEN.crimson : GARDEN.crimsonPaper);

/** The plain G, one color. */
export function GardenG({ size = 24, ground = "dark", className }: { size?: number; ground?: Ground; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="none" aria-hidden="true" className={className}>
      <path d={GARDEN_G_PATH} stroke={crimsonOn(ground)} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The disc with the G cut out. The cut-out is transparent, so it takes
 *  whatever it sits on. */
export function GardenDisc({ size = 24, ground = "dark", className }: { size?: number; ground?: Ground; className?: string }) {
  // One mask per disc: two on a page can't share an id.
  const mask = `garden-disc-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className={className} style={{ flexShrink: 0 }}>
      <defs>
        <mask id={mask}>
          <rect width="32" height="32" fill="#fff" />
          <path
            d={GARDEN_G_PATH}
            fill="none"
            stroke="#000"
            strokeWidth={3.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            transform={IN_DISC}
          />
        </mask>
      </defs>
      <circle cx="16" cy="16" r="15" fill={crimsonOn(ground)} mask={`url(#${mask})`} />
    </svg>
  );
}

/** The disc and "The Garden". `fontSize` sets both: the disc is 1.25× it.
 *  `grow` plays the sprout-to-disc animation (see GardenGrow); `surface` is
 *  the color under the mark, which the growing G is drawn in until the real
 *  cut-out takes over. The name is there from the first paint either way. */
export function GardenLockup({
  fontSize = 16,
  ground = "dark",
  grow = false,
  surface,
  className,
}: {
  fontSize?: number;
  ground?: Ground;
  grow?: boolean;
  surface?: string;
  className?: string;
}) {
  const disc = Math.round(fontSize * 1.25);
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: Math.round(disc / 4), lineHeight: 1 }}
    >
      {grow ? (
        <GardenGrow size={disc} ground={ground} surface={surface ?? (ground === "dark" ? "#121212" : "#F7F7F4")} />
      ) : (
        <GardenDisc size={disc} ground={ground} />
      )}
      <span
        style={{
          fontFamily: "'Jost', var(--garden-font-sans, sans-serif)",
          fontWeight: 500,
          fontSize,
          letterSpacing: "-0.01em",
          whiteSpace: "nowrap",
          color: ground === "dark" ? "#F4F4F2" : GARDEN.ink,
        }}
      >
        {GARDEN.name}
      </span>
    </span>
  );
}

// ── Grow ────────────────────────────────────────────────────────────────
// Claude Design's Turn 6 timeline, in seconds at 1× (it runs ~5s there; the
// site plays it faster). The stem's points morph into the G's, so the two
// arrays pair up point for point.

const STEM = [16, 12, 16, 13, 16, 14, 16, 15, 16, 16, 16, 17, 16, 18, 16, 19, 16, 20, 16, 21, 16, 22, 16, 23, 16, 24, 16, 25, 16, 26, 16, 27];
const GPTS = [23.4, 10.4, 21.7, 8.3, 19.1, 7, 16.2, 7, 10.8, 7, 6.6, 11.2, 6.6, 16.5, 6.6, 21.8, 10.8, 26, 16.2, 26, 21.2, 26, 25.2, 22.3, 25.4, 17.2, 22.6, 17.2, 19.8, 17.2, 17, 17.2];
const END = 5.0;
/** The site plays the 5s design timeline in 2s. */
export const GROW_SPEED = 2.5;
const PLAYED_KEY = "garden-grow-played-on";

const toD = (a: number[]) => {
  let d = `M${a[0].toFixed(2)} ${a[1].toFixed(2)}`;
  for (let i = 2; i < a.length; i += 6) d += `C${a.slice(i, i + 6).map((n) => n.toFixed(2)).join(" ")}`;
  return d;
};
const seg = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const back = (t: number) => (t === 0 ? 0 : 1 + 2.6 * Math.pow(t - 1, 3) + 1.6 * Math.pow(t - 1, 2));

/** Every animated attribute at time `t` (seconds at 1×). Pure, for tests. */
export function growFrame(t: number) {
  const p = ease(seg(t, 0.2, 1.4));
  const m = ease(seg(t, 3.0, 4.3));
  const shrink = 1 - ease(seg(t, 3.0, 3.6));
  const scale = 1 - 0.34 * m;
  return {
    stemD: toD(STEM.map((v, i) => v + (GPTS[i] - v) * m)),
    stemWidth: 2.2 + 1.2 * m,
    /** Dash offset: the stem draws upward from its base. */
    stemOffset: -(1 - p),
    groupTransform: `translate(16 16) scale(${scale.toFixed(4)}) translate(-16 ${(-16 - 0.5 * m).toFixed(3)})`,
    groundOpacity: seg(t, 0, 0.3) * (1 - seg(t, 3.0, 3.6)),
    leafR: Math.max(back(seg(t, 1.1, 2.0)) * shrink, 0.0001),
    leafL: Math.max(back(seg(t, 1.4, 2.3)) * shrink, 0.0001),
    discR: Math.max(back(seg(t, 4.2, 5.0)) * 15, 0),
    knock: ease(seg(t, 4.3, 4.8)),
  };
}

const today = () => new Date().toDateString();

function alreadyPlayed(): boolean {
  try {
    return localStorage.getItem(PLAYED_KEY) === today();
  } catch {
    return false;
  }
}

function markPlayed() {
  try {
    localStorage.setItem(PLAYED_KEY, today());
  } catch {
    // Storage blocked: it plays again next time, which is fine.
  }
}

/** The disc that grows in. Renders the still disc on the server, during
 *  hydration, once it has played today on this device, and under reduced
 *  motion. */
export function GardenGrow({ size, ground, surface }: { size: number; ground: Ground; surface: string }) {
  const [playing, setPlaying] = useState(false);
  const refs = useRef<Record<string, SVGElement | null>>({});
  const color = crimsonOn(ground);

  // Before paint, so a tab that will animate never shows the finished disc first.
  useLayoutEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || alreadyPlayed()) return;
    markPlayed();
    setPlaying(true);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(((now - start) / 1000) * GROW_SPEED, END);
      const f = growFrame(t);
      const r = refs.current;
      r.group?.setAttribute("transform", f.groupTransform);
      r.ground?.setAttribute("opacity", String(f.groundOpacity));
      r.disc?.setAttribute("r", f.discR.toFixed(3));
      for (const key of ["stem", "knock"] as const) {
        const el = r[key];
        if (!el) continue;
        el.setAttribute("d", f.stemD);
        el.setAttribute("stroke-width", f.stemWidth.toFixed(3));
        el.setAttribute("stroke-dashoffset", String(f.stemOffset));
      }
      r.knock?.setAttribute("opacity", String(f.knock));
      r.leafR?.setAttribute("transform", `translate(16 16) scale(${f.leafR}) translate(-16 -16)`);
      r.leafL?.setAttribute("transform", `translate(16 19.5) scale(${f.leafL}) translate(-16 -19.5)`);
      if (t < END) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  if (!playing) return <GardenDisc size={size} ground={ground} />;

  const first = growFrame(0);
  const ref = (key: string) => (el: SVGElement | null) => {
    refs.current[key] = el;
  };
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ overflow: "visible", flexShrink: 0 }}
    >
      <circle ref={ref("disc")} cx="16" cy="16" r={0} fill={color} />
      <path ref={ref("ground")} d="M10 27h12" stroke={color} strokeWidth={2.4} opacity={0} />
      <g ref={ref("group")} transform={first.groupTransform}>
        <path ref={ref("stem")} d={first.stemD} stroke={color} pathLength={1} strokeDasharray="1 1" strokeDashoffset={first.stemOffset} />
        <path ref={ref("knock")} d={first.stemD} stroke={surface} pathLength={1} strokeDasharray="1 1" strokeDashoffset={first.stemOffset} opacity={0} />
        <path ref={ref("leafR")} d="M16 16c0-4.6 2.8-7.6 7.6-7.6 0 4.6-2.8 7.6-7.6 7.6z" fill={color} transform="translate(16 16) scale(0.0001) translate(-16 -16)" />
        <path ref={ref("leafL")} d="M16 19.5c-4.6 0-7.4-3-7.4-7.6 4.6 0 7.4 3 7.4 7.6z" fill={color} transform="translate(16 19.5) scale(0.0001) translate(-16 -19.5)" />
      </g>
    </svg>
  );
}

/** For pages that follow the light/dark theme (login, signup): the on-dark
 *  lockup in dark, the on-paper one in light, where paper-colored words
 *  would vanish. */
export function GardenLockupThemed({ fontSize }: { fontSize: number }) {
  return (
    <>
      <span className="hidden dark:inline-flex">
        <GardenLockup fontSize={fontSize} ground="dark" />
      </span>
      <span className="inline-flex dark:hidden">
        <GardenLockup fontSize={fontSize} ground="paper" />
      </span>
    </>
  );
}
