// Small repeating-row editor for optional paid ticket tiers on an event
// (e.g. General $25 · Patron $100 · Table $500). Shared by CreateEventModal
// and the event page's EditEventModal. Server-side validation lives in
// convex/events.ts (normalizeTicketTiers); this converts form drafts to the
// mutation's { name, priceCents, description?, quantity? } shape.

export interface TicketTierDraft {
  name: string;
  price: string; // dollars, as typed (e.g. "25" or "25.00")
  description: string;
  quantity: string; // optional cap, as typed
}

export interface TicketTier {
  name: string;
  priceCents: number;
  description?: string;
  quantity?: number;
}

export function emptyTierDraft(): TicketTierDraft {
  return { name: "", price: "", description: "", quantity: "" };
}

export function tiersToDrafts(tiers?: TicketTier[]): TicketTierDraft[] {
  if (!tiers) return [];
  return tiers.map((tier) => ({
    name: tier.name,
    price: (tier.priceCents / 100).toFixed(tier.priceCents % 100 === 0 ? 0 : 2),
    description: tier.description ?? "",
    quantity: tier.quantity !== undefined ? String(tier.quantity) : "",
  }));
}

/** Converts drafts to the mutation shape. Rows that are entirely blank are
 * dropped; a partially-filled row returns a user-facing error instead. */
export function draftsToTiers(
  drafts: TicketTierDraft[],
): { tiers?: TicketTier[]; error?: string } {
  const tiers: TicketTier[] = [];
  for (const draft of drafts) {
    const name = draft.name.trim();
    const price = draft.price.trim();
    const description = draft.description.trim();
    const quantity = draft.quantity.trim();

    // Fully blank row — treat as removed.
    if (!name && !price && !description && !quantity) continue;

    if (!name) return { error: "Every ticket tier needs a name" };
    const priceDollars = Number(price);
    if (!price || !Number.isFinite(priceDollars) || priceDollars < 0.5) {
      return {
        error: `Ticket tier "${name}" needs a price of at least $0.50`,
      };
    }
    const priceCents = Math.round(priceDollars * 100);

    let cap: number | undefined;
    if (quantity) {
      const parsed = Number(quantity);
      if (!Number.isInteger(parsed) || parsed < 1) {
        return {
          error: `Ticket tier "${name}" has an invalid quantity cap`,
        };
      }
      cap = parsed;
    }

    tiers.push({
      name,
      priceCents,
      description: description || undefined,
      quantity: cap,
    });
  }
  return { tiers: tiers.length > 0 ? tiers : undefined };
}

const inputClass =
  "w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white text-sm";

export function TicketTierEditor({
  tiers,
  onChange,
}: {
  tiers: TicketTierDraft[];
  onChange: (tiers: TicketTierDraft[]) => void;
}) {
  function updateTier(index: number, patch: Partial<TicketTierDraft>) {
    onChange(
      tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)),
    );
  }

  function removeTier(index: number) {
    onChange(tiers.filter((_, i) => i !== index));
  }

  function moveTier(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= tiers.length) return;
    const next = [...tiers];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {tiers.map((tier, i) => (
        <div
          key={i}
          className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-2"
        >
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={tier.name}
              onChange={(e) => updateTier(i, { name: e.target.value })}
              placeholder="Tier name (e.g. General)"
              className={inputClass}
            />
            <div className="relative w-28 flex-shrink-0">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                $
              </span>
              <input
                type="number"
                min="0.5"
                step="0.01"
                value={tier.price}
                onChange={(e) => updateTier(i, { price: e.target.value })}
                placeholder="25"
                className={`${inputClass} pl-7`}
              />
            </div>
            <div className="flex flex-col flex-shrink-0">
              <button
                type="button"
                onClick={() => moveTier(i, -1)}
                disabled={i === 0}
                aria-label="Move tier up"
                className="px-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 leading-none"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => moveTier(i, 1)}
                disabled={i === tiers.length - 1}
                aria-label="Move tier down"
                className="px-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 leading-none"
              >
                ▼
              </button>
            </div>
            <button
              type="button"
              onClick={() => removeTier(i)}
              aria-label="Remove tier"
              className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-600 rounded-full"
            >
              ×
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={tier.description}
              onChange={(e) => updateTier(i, { description: e.target.value })}
              placeholder="Short description (optional)"
              className={inputClass}
            />
            <input
              type="number"
              min="1"
              step="1"
              value={tier.quantity}
              onChange={(e) => updateTier(i, { quantity: e.target.value })}
              placeholder="Cap"
              title="Maximum number available (optional)"
              className={`${inputClass} w-28 flex-shrink-0`}
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...tiers, emptyTierDraft()])}
        className="text-sm font-medium text-blue-600 hover:text-blue-500"
      >
        + Add ticket tier
      </button>
      {tiers.length === 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          No tiers — the event stays free / RSVP-only.
        </p>
      )}
    </div>
  );
}
