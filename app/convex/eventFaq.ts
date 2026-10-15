// "Questions people ask" on an event page: a host's own list of question and
// answer pairs, edited in the event form (components/EventFaq.tsx shows it).
// An answer may carry links as [text](/path) or [text](https://…).

import { v } from "convex/values";

export const MAX_FAQ = 12;
export const MAX_QUESTION = 200;
export const MAX_ANSWER = 1500;

export const faqValidator = v.array(v.object({ q: v.string(), a: v.string() }));

export type FaqItem = { q: string; a: string };

/** Trim, drop empty rows, and refuse a half-filled one in words the host can act on. */
export function normalizeFaq(input: FaqItem[] | undefined): { faq?: FaqItem[]; error?: string } {
  if (!input) return {};
  const rows = input.map((r) => ({ q: r.q.trim(), a: r.a.trim() })).filter((r) => r.q || r.a);
  if (rows.length > MAX_FAQ) return { error: `At most ${MAX_FAQ} questions.` };
  for (const r of rows) {
    if (!r.q) return { error: "Each answer needs a question." };
    if (!r.a) return { error: `Add an answer to "${r.q.slice(0, 40)}", or remove the question.` };
    if (r.q.length > MAX_QUESTION) return { error: `Keep each question under ${MAX_QUESTION} characters.` };
    if (r.a.length > MAX_ANSWER) return { error: `Keep each answer under ${MAX_ANSWER} characters.` };
  }
  return { faq: rows };
}
