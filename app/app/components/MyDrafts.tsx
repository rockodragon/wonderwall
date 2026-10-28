// "Drafts": the projects this person has saved and not yet published, which
// only they can see (garden.projects.listMyDrafts). A small card on a phone's
// Today and on the Canvas, and a section on their own page. Each row opens the
// draft's page, where its Publish button is. Nothing at all while the list
// loads or when there are none: the card is not an ask, it is a way back.
// It takes the same two tones as the Share a project card (cardTone.ts).

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { FOCUS_RING_CLASS } from "../desk/tokens";
import { CARD_TONE, type CardTone } from "./cardTone";

export type MyDraft = FunctionReturnType<typeof api.garden.projects.listMyDrafts>[number];

/** The card lists this many and says how many more there are. */
export const DRAFTS_SHOWN = 3;

// What the card is made of, so a layout that keeps clear of it (the Canvas)
// can know how tall it draws: the border and padding, the 24px label, the
// list's gap, 44px rows and the 24px "more" line.
const ROW_H = 44;
const MORE_H = 24;
const CARD_CHROME = 2 + 24 + 24 + 4;

/** How tall the card draws for `count` drafts. */
export function draftsCardHeight(count: number): number {
  return CARD_CHROME + ROW_H * Math.min(count, DRAFTS_SHOWN) + (count > DRAFTS_SHOWN ? MORE_H : 0);
}

/** The signed-in person's own drafts, newest first; [] signed out, undefined
 *  while it loads. The Canvas reads it too, to leave room for the card. */
export function useMyDrafts(): MyDraft[] | undefined {
  return useQuery(api.garden.projects.listMyDrafts, {});
}

/** One draft: a 44px link to its page, the title, a small square picture when
 *  it has one, and "Draft" in the dim tone. */
export function DraftRow({ draft, tone }: { draft: MyDraft; tone: CardTone }) {
  const c = CARD_TONE[tone];
  return (
    <li>
      <Link
        to={`/projects/${draft._id}`}
        className={`flex h-11 items-center gap-3 rounded-lg no-underline ${FOCUS_RING_CLASS}`}
        style={{ color: c.text }}
      >
        {draft.photoUrl && (
          <img
            src={draft.photoUrl}
            alt=""
            decoding="async"
            className="h-8 w-8 shrink-0 rounded-md object-cover"
            style={{ backgroundColor: c.line }}
          />
        )}
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{draft.title}</span>
        <span className="shrink-0 text-[13px]" style={{ color: c.soft }}>
          Draft
        </span>
      </Link>
    </li>
  );
}

/** The rows, `limit` of them with "+N more" under, or all when there is no
 *  limit (your own page lists every one). */
export function DraftList({ drafts, tone, limit }: { drafts: readonly MyDraft[]; tone: CardTone; limit?: number }) {
  const shown = limit === undefined ? drafts : drafts.slice(0, limit);
  const more = drafts.length - shown.length;
  return (
    <>
      <ul className="mt-1">
        {shown.map((draft) => (
          <DraftRow key={draft._id} draft={draft} tone={tone} />
        ))}
      </ul>
      {more > 0 && (
        <p className="h-6 text-[13px] leading-6" style={{ color: CARD_TONE[tone].soft }}>
          {`+${more} more`}
        </p>
      )}
    </>
  );
}

export function MyDrafts({ tone, className }: { tone: CardTone; className?: string }) {
  const drafts = useMyDrafts();
  if (!drafts || drafts.length === 0) return null;
  const c = CARD_TONE[tone];
  return (
    <section
      aria-label="Drafts"
      className={`rounded-xl border px-5 py-3 ${className ?? ""}`}
      style={{ borderColor: c.line, background: c.bg, maxWidth: 600 }}
    >
      <p className="h-6 text-[15px] font-semibold leading-6" style={{ color: c.text }}>
        Drafts
      </p>
      <DraftList drafts={drafts} tone={tone} limit={DRAFTS_SHOWN} />
    </section>
  );
}

/** Your own page's "Drafts": every one, above "In progress". It asks for the
 *  list itself, so it is only drawn (and the query only made) on your own page. */
export function OwnDrafts() {
  const drafts = useMyDrafts();
  if (!drafts || drafts.length === 0) return null;
  const c = CARD_TONE.page;
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-4" style={{ color: c.text }}>
        Drafts
      </h2>
      <div className="max-w-xl rounded-xl border px-5 py-2" style={{ borderColor: c.line, background: c.bg }}>
        <DraftList drafts={drafts} tone="page" />
      </div>
    </section>
  );
}
