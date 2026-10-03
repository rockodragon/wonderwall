"use node";

import { Resend } from "resend";
import type { EmailMessage, EmailProvider, EmailSendResult } from "./types";
import { withDisplayName } from "./sender";

const DEFAULT_FROM = "TheCreative.exchange <hello@thecreative.exchange>";

export function createResendProvider(apiKey: string): EmailProvider {
  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM || DEFAULT_FROM;

  return {
    name: "resend",
    async send(msg: EmailMessage): Promise<EmailSendResult> {
      const { data, error } = await resend.emails.send({
        from: withDisplayName(from, msg.fromName),
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        headers: msg.headers,
        replyTo: msg.replyTo,
      });

      if (error) {
        return { ok: false, error: error.message };
      }
      return { ok: true, id: data?.id };
    },
  };
}
