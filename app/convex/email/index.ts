"use node";

// Picks the email provider by env. Only imported from emails.ts (also
// "use node") — resendProvider touches the Resend Node SDK, so this file
// can't be imported from plain Convex code.

import type { EmailProvider } from "./types";
import { createResendProvider } from "./resendProvider";
import { createConsoleProvider } from "./consoleProvider";

export function getEmailProvider(): EmailProvider {
  const configured = process.env.EMAIL_PROVIDER;

  if (configured === "console") return createConsoleProvider();
  if (configured === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("EMAIL_PROVIDER=resend but RESEND_API_KEY is not set; falling back to console");
      return createConsoleProvider();
    }
    return createResendProvider(apiKey);
  }

  // Default: resend if a key is present, otherwise console.
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) return createResendProvider(apiKey);
  return createConsoleProvider();
}

export type { EmailProvider, EmailMessage, EmailSendResult } from "./types";
