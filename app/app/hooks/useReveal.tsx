import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

export function useReveal<T extends HTMLElement = HTMLDivElement>(
  delay = 0,
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReduced) {
      el.style.opacity = "1";
      el.style.transform = "none";
      return;
    }

    el.style.opacity = "0";
    el.style.transform = "translateY(24px)";
    el.style.transition = `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.opacity = "1";
          el.style.transform = "translateY(0)";
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return ref;
}

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useReveal(delay);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** Dissolves its children in — opacity only, no movement — the first time
    they scroll into view. For images: a picture that fades up reads as
    placed on purpose; one that slides reads as loading. Slow by design
    (1.4s); reduced-motion gets the image at once. */
export function Dissolve({
  children,
  className,
  style,
  duration = 1400,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  duration?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.style.opacity = "1";
      return;
    }
    el.style.opacity = "0";
    el.style.transition = `opacity ${duration}ms ease-out`;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.opacity = "1";
          observer.unobserve(el);
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [duration]);
  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}
