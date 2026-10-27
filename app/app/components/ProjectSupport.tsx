// Cheering and backing a project: the heart and the dollar on a project
// (SupportButtons), the sheet they open (SupportModal), and the one place that
// decides what a tap does (useProjectSupport). Used by the Projects page, a
// project's own page and Today's posts. Kept out of routes/projects.tsx so
// Today doesn't pull that whole route (HireFlow and the rest) into the phone
// home's chunk; routes/projects.tsx re-exports all of it for the imports that
// already point there.

import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { CurrencyDollar, Heart } from "@phosphor-icons/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { formatCents } from "../../convex/money";
import { CLAIMS } from "../constants/claims";
import { errorMessage } from "../lib/convexError";
import { FF_BACKING } from "../lib/featureFlags";
import { supportDetour } from "../lib/pendingIntent";

export type SupportMode = "cheer" | "back";

/** The two ways to show up for a project (docs/features/project-ia.md), as
 * icons: a heart to Cheer, a dollar to Back this (Rick, 2026-10-22).
 * Cheering is always there and costs nothing; backing only appears once the
 * owner has asked for support — a project that isn't raising has no money
 * button to press — and only while backing is open (FF_BACKING). `count`
 * (everyone who cheered or backed it) sits beside the heart once there is
 * one. */
export function SupportButtons({
  raising,
  onSupport,
  count = 0,
  size = "md",
  name,
}: {
  raising: boolean;
  onSupport: (mode: SupportMode) => void;
  count?: number;
  size?: "sm" | "md" | "post";
  /** What is being cheered or backed, said in each button's accessible name
   *  ("Cheer Songs of Safety", "Back Songs of Safety") so a page of posts
   *  isn't a row of identical Cheers. Without it: "Cheer" and "Back this". */
  name?: string;
}) {
  // `post` is a feed post's action row (Today): 44px targets, a bigger
  // heart, and the count in the page's own text colour at 15px semibold.
  const post = size === "post";
  const box = post ? "w-11 h-11" : size === "sm" ? "w-9 h-9" : "w-10 h-10";
  const icon = post ? 26 : size === "sm" ? 20 : 22;
  const cheerLabel = name ? `Cheer ${name}` : "Cheer";
  const backLabel = name ? `Back ${name}` : "Back this";
  const click = (mode: SupportMode) => (e: React.MouseEvent) => {
    // Cards are links; a button inside one must not also navigate.
    e.preventDefault();
    e.stopPropagation();
    onSupport(mode);
  };
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={click("cheer")}
        aria-label={cheerLabel}
        title={cheerLabel}
        className={`${box} inline-flex items-center justify-center rounded-full transition-opacity hover:opacity-80`}
        style={{ color: post ? "var(--app-text)" : "var(--garden-paper)" }}
      >
        <Heart size={icon} aria-hidden="true" />
      </button>
      {count > 0 && (
        <span
          className={post ? "text-[15px] font-semibold tabular-nums pr-2" : "text-[13.5px] tabular-nums pr-1"}
          style={
            post
              ? { color: "var(--app-text)" }
              : { color: "var(--garden-muted)", fontFamily: "var(--garden-font-mono)" }
          }
        >
          {count}
          <span className="sr-only"> {count === 1 ? "supporter" : "supporters"}</span>
        </span>
      )}
      {raising && FF_BACKING && (
        <button
          type="button"
          onClick={click("back")}
          aria-label={backLabel}
          title={backLabel}
          className={`${box} inline-flex items-center justify-center rounded-full transition-opacity hover:opacity-90`}
          style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
        >
          <CurrencyDollar size={icon} weight="bold" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// Split by the two buttons (SupportButtons): cheering is free — a message or
// an offer of help; backing is money.
const SUPPORT_TYPES: Record<SupportMode, { value: string; label: string }[]> = {
  cheer: [
    { value: "encouragement", label: "Send a message" },
    { value: "resource", label: "Offer help or gear" },
  ],
  back: [
    { value: "financial_one_time", label: "Once" },
    { value: "financial_recurring", label: "Monthly" },
    { value: "financial_annual", label: "Yearly" },
  ],
};

/** What a backing tier costs, as the backer reads it: "$25" once, "$25/mo",
 *  or "$300/yr" when they pick Yearly (twelve months, charged together). */
export function tierPriceLabel(tier: { priceCents: number; billing?: string }, type: string): string {
  if ((tier.billing ?? "monthly") === "one_time") return formatCents(tier.priceCents);
  if (type === "financial_annual") return `${formatCents(tier.priceCents * 12)}/yr`;
  return `${formatCents(tier.priceCents)}/mo`;
}

// Twin of MIN_BACKING_CENTS in convex/garden/stripeHandlers.ts (the server
// is the authority; this is only so the modal can say it out loud and catch
// an obvious miss before a round trip).
const MIN_BACKING_DOLLARS = 5;

// One-tap amounts in the Back this modal; each goes straight to Stripe.
export const BACKING_PRESET_DOLLARS = [10, 25, 50] as const;

/** What SupportModal sends createBackingCheckout. A signed-out backer who
 *  chose to be named sends that name, trimmed (the server stores a guest's
 *  backing under it); an anonymous guest and a member send none. Pure. */
export function backingCheckoutArgs(p: {
  projectId: Id<"projects">;
  amountCents: number;
  type: string;
  visible: boolean;
  message: string;
  tierId?: string;
  signedIn: boolean;
  guestName: string;
}) {
  return {
    projectId: p.projectId,
    amountCents: p.amountCents,
    recurring: p.type !== "financial_one_time",
    visible: p.visible,
    message: p.message.trim() || undefined,
    tierId: p.tierId,
    ...(p.type === "financial_annual" ? { interval: "year" as const } : {}),
    ...(!p.signedIn && p.visible ? { guestName: p.guestName.trim() } : {}),
  };
}

// Backing a project is REAL money now: the two financial options open a
// Stripe Checkout session (convex/garden/stripe.ts's createBackingCheckout)
// and hand the browser off to it, exactly like fund.$slug.tsx's
// AddToPoolPanel. Encouragement and resource offers are unchanged — they're
// free, they post instantly, and nothing about them involves a charge.
//
// Money words (the rule stripe.ts states for its own lane): money moving
// through the platform's Stripe is "back"/"fund"/"add to" — never
// "donate"/"gift"/tax-deductible.
export function SupportModal({
  project,
  mode,
  onClose,
}: {
  project: any;
  mode: SupportMode;
  onClose: () => void;
}) {
  const existing = useQuery(api.garden.support.listSupportForProject, { projectId: project._id });
  const tiers = useQuery((api as any).garden.patronTiers.listTiers, { projectId: project._id });
  const supportProject = useMutation(api.garden.support.supportProject);
  const createBackingCheckout = useAction(api.garden.stripe.createBackingCheckout);
  // The project page is public, and a visitor may back it without an
  // account: once only (a monthly backing needs one, and the server says
  // so), under the name they type unless they back it anonymously.
  const { isAuthenticated } = useConvexAuth();

  const [type, setType] = useState(
    mode === "cheer" ? "encouragement" : isAuthenticated ? "financial_recurring" : "financial_one_time",
  );
  const [guestName, setGuestName] = useState("");
  // A guest backs once: Monthly and Yearly need an account, so they aren't offered.
  const typeOptions =
    mode === "back" && !isAuthenticated
      ? SUPPORT_TYPES.back.filter((t) => t.value === "financial_one_time")
      : SUPPORT_TYPES[mode];
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [resourceDescription, setResourceDescription] = useState("");
  const [visible, setVisible] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [showCustomAmount, setShowCustomAmount] = useState(false);
  const [showOtherAmount, setShowOtherAmount] = useState(false);

  const isFinancial = type === "financial_one_time" || type === "financial_recurring" || type === "financial_annual";
  const billingFilter = type === "financial_one_time" ? "one_time" : "monthly";
  const filteredTiers = tiers?.filter((t: any) => (t.billing ?? "monthly") === billingFilter);
  const hasTiers = filteredTiers && filteredTiers.length > 0;
  const selectedTier = tiers?.find((t: any) => t._id === selectedTierId);

  async function startCheckout(finalAmountCents: number, finalTierId?: string) {
    setError("");
    // Mirrors the server's floor (validateBackingAmount) so an obvious
    // miss costs a round trip to nowhere instead of a round trip to Convex.
    if (!Number.isFinite(finalAmountCents) || finalAmountCents < MIN_BACKING_DOLLARS * 100) {
      setError(`Back this with at least $${MIN_BACKING_DOLLARS}.`);
      return;
    }
    setSubmitting(true);
    try {
      const { url } = await createBackingCheckout(
        backingCheckoutArgs({
          projectId: project._id,
          amountCents: finalAmountCents,
          type,
          visible,
          message,
          tierId: finalTierId,
          signedIn: isAuthenticated,
          guestName,
        }),
      );
      // Leaving for Stripe — deliberately no setSubmitting(false), so the
      // button stays disabled through the handoff.
      window.location.assign(url);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (isFinancial) {
      if (selectedTier && !showCustomAmount) {
        await startCheckout(
          type === "financial_annual" ? selectedTier.priceCents * 12 : selectedTier.priceCents,
          selectedTier._id,
        );
      } else {
        await startCheckout(Math.round(Number(amount) * 100));
      }
      return;
    }

    setSubmitting(true);
    try {
      await supportProject({
        projectId: project._id,
        type,
        message: type === "encouragement" ? message.trim() : undefined,
        resourceDescription: type === "resource" ? resourceDescription.trim() : undefined,
        visible,
      });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex p-4 overflow-y-auto" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
      <div
        className="w-full max-w-md rounded-2xl border p-6 m-auto"
        style={{ backgroundColor: "var(--garden-ink-raised)", borderColor: "var(--garden-hairline)" }}
      >
        <h2
          className="text-xl font-semibold mb-1"
          style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
        >
          {mode === "cheer" ? "Cheer on" : "Back"} "{project.title}"
        </h2>
        <p className="text-sm mb-4" style={{ color: "var(--garden-dim)" }}>
          {mode === "cheer"
            ? "A few words, or something you can lend. It's free, and it shows up on the project."
            : "Put money toward this project."}
        </p>

        {existing && existing.length > 0 && (
          <div className="mb-5 pb-5" style={{ borderBottom: "1px solid var(--garden-hairline)" }}>
            <p className="text-xs uppercase tracking-[0.06em] mb-2" style={{ color: "var(--garden-dim)" }}>
              Supported by
            </p>
            <ul className="flex flex-col gap-2 max-h-32 overflow-y-auto">
              {existing.map((e) => (
                <li key={e._id} className="text-sm" style={{ color: "var(--garden-body)" }}>
                  <span style={{ color: "var(--garden-paper)" }}>{e.supporterName}</span>
                  {e.tierName && (
                    <span
                      className="ml-1.5 px-1.5 py-0.5 rounded text-[12px] font-medium uppercase tracking-[0.04em]"
                      style={{ backgroundColor: "rgba(254,226,104,0.12)", color: "var(--garden-citron)" }}
                    >
                      {e.tierName}
                    </span>
                  )}
                  {e.type === "financial_one_time" && e.amountCents && (
                    <span style={{ color: "var(--garden-citron)" }}>
                      {" "}· {formatCents(e.amountCents)}
                      {e.status === "pledged" ? " pledged" : " backed"}
                    </span>
                  )}
                  {(e.type === "financial_recurring" || e.type === "financial_annual") && e.amountCents && (
                    <span style={{ color: "var(--garden-citron)" }}>
                      {" "}· {formatCents(e.amountCents)}{e.type === "financial_annual" ? "/yr" : "/mo"}
                      {e.status === "pledged" ? " pledged" : ""}
                    </span>
                  )}
                  {e.message && <span style={{ color: "var(--garden-dim)" }}> — "{e.message}"</span>}
                  {e.resourceDescription && (
                    <span style={{ color: "var(--garden-dim)" }}> — offered {e.resourceDescription}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {done ? (
          <div className="py-4">
            {/* Only encouragement and resource land here — a financial
                backing leaves for Stripe Checkout instead of resolving
                in-modal. */}
            <p className="text-sm mb-4" style={{ color: "var(--garden-body)" }}>
              Thanks for showing up for this.
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {typeOptions.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => { setType(t.value); setSelectedTierId(null); setShowCustomAmount(false); setShowOtherAmount(false); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
                  style={{
                    fontFamily: "var(--garden-font-body)",
                    backgroundColor: type === t.value ? "var(--garden-citron)" : "var(--garden-ink)",
                    color: type === t.value ? "var(--garden-ink)" : "var(--garden-muted)",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Before the amounts: a preset goes straight to checkout. */}
            {isFinancial && !isAuthenticated && visible && (
              <div>
                <label
                  htmlFor="support-guest-name"
                  className="block text-xs uppercase tracking-[0.06em] mb-1.5"
                  style={{ color: "var(--garden-dim)" }}
                >
                  Your name, as it shows on the project
                </label>
                <input
                  id="support-guest-name"
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  autoComplete="name"
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{
                    backgroundColor: "var(--garden-ink)",
                    borderColor: "var(--garden-hairline-raised)",
                    color: "var(--garden-paper)",
                  }}
                />
              </div>
            )}

            {isFinancial && hasTiers && !showCustomAmount ? (
              <div className="flex flex-col gap-2">
                {filteredTiers.map((tier: any) => (
                  <button
                    key={tier._id}
                    type="button"
                    onClick={() => { setSelectedTierId(tier._id); setShowCustomAmount(false); }}
                    className="text-left rounded-xl border p-3 transition-colors"
                    style={{
                      borderColor: selectedTierId === tier._id ? "var(--garden-citron)" : "var(--garden-hairline)",
                      backgroundColor: selectedTierId === tier._id ? "rgba(254,226,104,0.08)" : "var(--garden-ink)",
                    }}
                  >
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-sm font-semibold" style={{ color: "var(--garden-paper)" }}>
                        {tier.name}
                      </span>
                      <span className="text-sm font-bold" style={{ color: "var(--garden-citron)", fontFamily: "var(--garden-font-mono)" }}>
                        {tierPriceLabel(tier, type)}
                      </span>
                    </div>
                    {tier.description && (
                      <p className="text-xs mb-1" style={{ color: "var(--garden-body)" }}>{tier.description}</p>
                    )}
                    {tier.benefits && tier.benefits.length > 0 && (
                      <ul className="text-xs flex flex-col gap-0.5" style={{ color: "var(--garden-dim)" }}>
                        {tier.benefits.map((b: string, i: number) => <li key={i}>· {b}</li>)}
                      </ul>
                    )}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { setSelectedTierId(null); setShowCustomAmount(true); }}
                  className="text-xs underline underline-offset-2 hover:opacity-80 self-start mt-1"
                  style={{ color: "var(--garden-dim)" }}
                >
                  Custom amount instead
                </button>
              </div>
            ) : isFinancial && (
              <div>
                {hasTiers && showCustomAmount && (
                  <button
                    type="button"
                    onClick={() => { setShowCustomAmount(false); }}
                    className="text-xs underline underline-offset-2 hover:opacity-80 mb-2"
                    style={{ color: "var(--garden-dim)" }}
                  >
                    Back to tiers
                  </button>
                )}
                <div className="flex flex-wrap gap-2 mb-2">
                  {BACKING_PRESET_DOLLARS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      disabled={submitting}
                      onClick={() => void startCheckout(d * 100)}
                      className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                      style={{
                        fontFamily: "var(--garden-font-mono)",
                        backgroundColor: "var(--garden-citron)",
                        color: "var(--garden-ink)",
                      }}
                    >
                      ${d}
                      {type === "financial_recurring" ? "/mo" : type === "financial_annual" ? "/yr" : ""}
                    </button>
                  ))}
                  {!showOtherAmount && (
                    <button
                      type="button"
                      onClick={() => setShowOtherAmount(true)}
                      className="px-3 py-2 rounded-lg border text-sm font-medium"
                      style={{ borderColor: "var(--garden-hairline-raised)", color: "var(--garden-body)" }}
                    >
                      Other amount
                    </button>
                  )}
                </div>
                {showOtherAmount && (
                  <>
                    <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
                      Amount (USD{type === "financial_recurring" ? "/mo" : type === "financial_annual" ? "/yr" : ""})
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="25"
                      className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                      style={{
                        fontFamily: "var(--garden-font-mono)",
                        backgroundColor: "var(--garden-ink)",
                        borderColor: "var(--garden-hairline-raised)",
                        color: "var(--garden-paper)",
                      }}
                    />
                  </>
                )}
                <p
                  className="text-xs mt-1.5 px-2.5 py-1.5 rounded-md"
                  style={{ color: "var(--garden-citron)", backgroundColor: "rgba(254,226,104,0.1)" }}
                >
                  ${MIN_BACKING_DOLLARS} minimum
                  {type === "financial_recurring" ? ", charged monthly until you cancel" : type === "financial_annual" ? ", charged annually until you cancel" : ""}.{" "}
                  {CLAIMS.processingFee} Next step is secure checkout — your card is charged there, not here.
                </p>
              </div>
            )}

            {isFinancial && (
              <div>
                <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
                  Note to the creator (optional)
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  placeholder="Why this one matters to you…"
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                  style={{
                    backgroundColor: "var(--garden-ink)",
                    borderColor: "var(--garden-hairline-raised)",
                    color: "var(--garden-paper)",
                  }}
                />
              </div>
            )}

            {type === "encouragement" && (
              <div>
                <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
                  Your message
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  placeholder="This is great — keep going."
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                  style={{
                    backgroundColor: "var(--garden-ink)",
                    borderColor: "var(--garden-hairline-raised)",
                    color: "var(--garden-paper)",
                  }}
                />
              </div>
            )}

            {type === "resource" && (
              <div>
                <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
                  What are you offering
                </label>
                <textarea
                  value={resourceDescription}
                  onChange={(e) => setResourceDescription(e.target.value)}
                  rows={2}
                  placeholder="A spare camera lens, an afternoon of color grading…"
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                  style={{
                    backgroundColor: "var(--garden-ink)",
                    borderColor: "var(--garden-hairline-raised)",
                    color: "var(--garden-paper)",
                  }}
                />
              </div>
            )}

            <label className="flex items-center gap-2 text-sm" style={{ color: "var(--garden-body)" }}>
              <input
                type="checkbox"
                checked={visible}
                onChange={(e) => setVisible(e.target.checked)}
              />
              Show me as a supporter
            </label>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ color: "var(--garden-dim)" }}>
                Cancel
              </button>
              {!(isFinancial && !(hasTiers && !showCustomAmount) && !showOtherAmount) && (
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
              >
                {submitting
                  ? isFinancial
                    ? "Starting checkout…"
                    : "Sending…"
                  : isFinancial
                    ? "Continue to checkout"
                    : "Send"}
              </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * Cheering or backing a project from a list: the one place that decides what
 * a tap does (the Projects page, a project's own page and Today's posts all
 * use it). Cheering needs an account, so a signed-out visitor goes to sign up
 * and comes back to this page (pendingIntent.supportDetour); backing doesn't,
 * the sheet opens for a visitor on a one-time payment (the server takes a
 * guest's one-time backing, not a monthly one). Until the token check settles
 * a member reads as signed out, so a tap then does nothing rather than send
 * them to sign up or a guest's sheet. `modal` is the sheet once one is open,
 * else null: render it anywhere on the page.
 */
export function useProjectSupport() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const [supporting, setSupporting] = useState<{ project: any; mode: SupportMode } | null>(null);
  const support = (project: any, mode: SupportMode) => {
    if (authLoading) return;
    const detour = supportDetour(mode, isAuthenticated, location.pathname + location.search);
    if (detour) navigate(detour);
    else setSupporting({ project, mode });
  };
  const modal = supporting ? (
    <SupportModal project={supporting.project} mode={supporting.mode} onClose={() => setSupporting(null)} />
  ) : null;
  return { support, modal };
}
