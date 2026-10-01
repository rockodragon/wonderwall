// Fallback provider used when no email API key is configured (local dev,
// CI). Logs the message instead of sending it. No Node SDK — safe to use
// from either runtime.

import type { EmailMessage, EmailProvider, EmailSendResult } from "./types";

export function createConsoleProvider(): EmailProvider {
  return {
    name: "console",
    async send(msg: EmailMessage): Promise<EmailSendResult> {
      console.log(
        `[console email provider] to=${msg.to} subject=${JSON.stringify(msg.subject)} text=${JSON.stringify(msg.text.slice(0, 200))}`,
      );
      return { ok: true };
    },
  };
}
