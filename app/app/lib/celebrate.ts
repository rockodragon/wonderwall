// The confetti an award gets the first time it shows (lib/celebrations.ts
// decides when). canvas-confetti is already how onboarding and Settings
// celebrate; this is the same burst in the canvas's own colors. Nothing at
// all when the person has asked for reduced motion.

import confetti from "canvas-confetti";

const COLORS = ["#FFE066", "#EDE3B4", "#F4F4F2", "#9FD3A8"];

export function throwConfetti(reducedMotion: boolean): void {
  if (reducedMotion) return;
  confetti({ particleCount: 110, spread: 75, startVelocity: 42, origin: { y: 0.55 }, colors: COLORS, disableForReducedMotion: true });
}
