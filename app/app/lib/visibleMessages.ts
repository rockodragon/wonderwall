// Only foreground, focused, intersecting message bubbles create read evidence.
// The observer watches identifiers, never message text.
export function observeVisibleMessageReads(
  root: HTMLElement,
  onRead: (messageIds: string[]) => Promise<unknown>,
): () => void {
  if (typeof IntersectionObserver === "undefined") return () => {};
  const visible = new Set<string>();
  const acknowledged = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let sending = false;
  let failures = 0;
  const foreground = () => document.visibilityState === "visible" && document.hasFocus();

  async function flush() {
    timer = undefined;
    if (stopped || sending || !foreground()) return;
    const ids = [...visible].filter(id => !acknowledged.has(id)).slice(0, 100);
    if (!ids.length) return;
    sending = true;
    try {
      await onRead(ids);
      ids.forEach(id => acknowledged.add(id));
      failures = 0;
    } catch {
      failures += 1;
    } finally {
      sending = false;
      if (!stopped && failures < 3 && [...visible].some(id => !acknowledged.has(id)))
        timer = setTimeout(flush, failures ? 1000 : 100);
    }
  }
  function schedule() {
    if (!stopped && foreground() && timer === undefined) timer = setTimeout(flush, 100);
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const id = (entry.target as HTMLElement).dataset.inboundMessageId;
      if (!id) continue;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) visible.add(id);
      else visible.delete(id);
    }
    schedule();
  }, { root, threshold: 0.5 });
  root.querySelectorAll<HTMLElement>("[data-inbound-message-id]").forEach(node => observer.observe(node));
  document.addEventListener("visibilitychange", schedule);
  window.addEventListener("focus", schedule);
  return () => {
    stopped = true;
    clearTimeout(timer);
    observer.disconnect();
    document.removeEventListener("visibilitychange", schedule);
    window.removeEventListener("focus", schedule);
  };
}
