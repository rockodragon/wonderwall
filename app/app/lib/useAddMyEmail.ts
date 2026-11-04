// Adding an email to an account that has none (a phone-only signup), from
// the Canvas card or Settings. The server keeps the first address and checks
// it (profiles.fillMissingBasics); this only checks the shape first so a typo
// gets a line without a round trip.

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { INVALID_EMAIL, isValidEmail } from "../../convex/emailAddress";
import { errorMessage } from "./convexError";

export function useAddMyEmail() {
  const fillMissingBasics = useMutation(api.profiles.fillMissingBasics);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function save(): Promise<boolean> {
    setError("");
    if (!isValidEmail(email)) {
      setError(INVALID_EMAIL);
      return false;
    }
    setPending(true);
    try {
      await fillMissingBasics({ email: email.trim() });
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setPending(false);
    }
  }

  // Typing again clears the last error.
  function type(next: string) {
    setEmail(next);
    setError("");
  }

  return { email, setEmail: type, pending, error, save, clearError: () => setError("") };
}
