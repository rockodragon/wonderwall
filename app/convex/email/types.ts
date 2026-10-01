// Provider-agnostic email types. Pure — no Node SDKs, importable from plain
// Convex code (mutations/queries) and from vitest without "use node".

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  replyTo?: string;
}

export type EmailSendResult = { ok: true; id?: string } | { ok: false; error: string };

export interface EmailProvider {
  name: string;
  send(msg: EmailMessage): Promise<EmailSendResult>;
}
