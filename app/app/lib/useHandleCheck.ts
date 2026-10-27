// The live check behind an address field (thecreative.exchange/@handle): the
// rules as someone types (convex/handleRules.ts), then the server's answer a
// moment after typing stops (handles.checkHandle: taken, held, a community's
// name). Settings' address section and the onboarding page's address field
// both read it, each with its own markup, so the two can't disagree.

import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { cleanHandle, HANDLE_PROBLEM_REASON, handleProblem } from "../../convex/handleRules";
import { errorMessage } from "./convexError";

/** `typed` is what's in the field; `current` is the address they hold now
 *  ("" when they have none). */
export function useHandleCheck(typed: string, current: string) {
  const handle = cleanHandle(typed);
  // A blank field isn't a problem yet; the rules speak once there's something.
  const problem = handle ? handleProblem(handle) : null;
  const unchanged = handle === current;

  // The server's answer, a moment after typing stops.
  const [asked, setAsked] = useState("");
  useEffect(() => {
    if (!handle || problem || unchanged) {
      setAsked("");
      return;
    }
    const timer = setTimeout(() => setAsked(handle), 300);
    return () => clearTimeout(timer);
  }, [handle, problem, unchanged]);
  const check = useQuery(api.handles.checkHandle, asked ? { handle: asked } : "skip");
  const answered = check !== undefined && check.handle === handle;
  const refused = !!problem || (answered && !check.ok);
  /** The line to show under the field, or null when there's nothing to say. */
  const status =
    !handle || unchanged
      ? null
      : problem
        ? HANDLE_PROBLEM_REASON[problem]
        : !answered
          ? "Checking…"
          : check.ok
            ? "Available."
            : check.reason;
  /** A changed address the check says is free. */
  const canSave = !!handle && !problem && !unchanged && answered && check.ok;

  return { handle, problem, unchanged, answered, refused, status, canSave };
}

/** What a save does with the address field: nothing (blank or unchanged),
 *  stop (already refused: its reason is showing, so no second ask), or claim
 *  it and let the server decide. */
export function pendingAddressStep(field: {
  handle: string;
  unchanged: boolean;
  refused: boolean;
}): "none" | "refused" | "claim" {
  if (!field.handle || field.unchanged) return "none";
  return field.refused ? "refused" : "claim";
}

/** The address field's turn in a save, before anything else is saved (Settings'
 *  Save Profile, onboarding's Continue). ok: the address is settled and the
 *  save can go on. Not ok: it was refused and the form stays where it is;
 *  `error` is the server's reason when the server is the one that refused,
 *  and null when the field is already showing why. */
export async function claimPendingAddress(
  field: { handle: string; unchanged: boolean; refused: boolean },
  claim: (handle: string) => Promise<unknown>,
): Promise<{ ok: true; claimed: boolean } | { ok: false; error: string | null }> {
  const step = pendingAddressStep(field);
  if (step === "none") return { ok: true, claimed: false };
  if (step === "refused") return { ok: false, error: null };
  try {
    await claim(field.handle);
    return { ok: true, claimed: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
