import { useEffect, useRef, useState } from "react";

/**
 * Copy text to the clipboard and say "Copied" for a moment. `copied` is the
 * key of the last thing copied (the text itself unless a key is given), so
 * one hook can serve a row of copy buttons.
 *
 * (ShareButton, useInviteLink and GigSchedule still copy on their own and can
 * move here.)
 */
export function useCopyText(ms = 2000) {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /** True once the text is on the clipboard; false when the browser said no. */
  async function copy(text: string, key: string = text): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return false;
    }
    setCopied(key);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), ms);
    return true;
  }

  return { copied, copy };
}
