// The lead's private view of pending candidates. Review state is deliberately
// independent from membership: considering someone does not accept them.
import { useEffect } from "react";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import type { PortfolioSample } from "../../../convex/portfolioSamples";
import type { RateProposal, ReviewStage } from "../../../convex/garden/recruitment";
import { PersonAvatar } from "../PersonAvatar";
import { ApplicationEvidence } from "./ApplicationEvidence";

export interface ApplicationCandidate {
  memberId: string;
  userId?: string | null;
  profileId?: string | null;
  name: string;
  imageUrl?: string | null;
  role: string;
  roleId?: string | null;
  message?: string | null;
  availability?: string | null;
  rateProposal?: RateProposal | null;
  workSamples?: readonly PortfolioSample[];
  reviewStage?: ReviewStage;
}

export function candidateRoleKey(candidate: Pick<ApplicationCandidate, "role" | "roleId">): string {
  return candidate.roleId ?? `label:${candidate.role.trim().toLowerCase()}`;
}

export function candidateRoleGroups(candidates: readonly ApplicationCandidate[], selectedRole = "all") {
  const groups = new Map<string, { key: string; title: string; candidates: ApplicationCandidate[] }>();
  for (const candidate of candidates) {
    const key = candidateRoleKey(candidate);
    if (selectedRole !== "all" && key !== selectedRole) continue;
    if (!groups.has(key)) groups.set(key, { key, title: candidate.role || "Proposed role", candidates: [] });
    groups.get(key)!.candidates.push(candidate);
  }
  return [...groups.values()];
}

export function ApplicationReview({
  candidates,
  busyId,
  notes,
  onNote,
  onStage,
  onDecision,
  messageButton,
}: {
  candidates: readonly ApplicationCandidate[];
  busyId: string | null;
  notes: Record<string, string>;
  onNote: (memberId: string, note: string) => void;
  onStage: (memberId: string, stage: ReviewStage) => void;
  onDecision: (memberId: string, accept: boolean) => void;
  messageButton: (candidate: ApplicationCandidate) => ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const selectedRole = params.get("reviewRole") ?? "all";
  const focusedId = params.get("candidate");
  const allGroups = candidateRoleGroups(candidates);
  const groups = candidateRoleGroups(candidates, selectedRole);
  useEffect(() => {
    if (focusedId) document.getElementById(`candidate-${focusedId}`)?.scrollIntoView?.({ block: "nearest" });
  }, [focusedId, candidates.length]);

  return (
    <section aria-label="Candidate review" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs uppercase tracking-[0.06em]" style={{ color: "var(--garden-dim)" }}>Requests · {candidates.length}</p>
        <label className="text-xs flex items-center gap-2" style={{ color: "var(--garden-dim)" }}>
          Review role
          <select
            value={selectedRole}
            onChange={(event) => setParams((previous) => {
              const next = new URLSearchParams(previous);
              if (event.target.value === "all") next.delete("reviewRole");
              else next.set("reviewRole", event.target.value);
              next.delete("candidate");
              return next;
            }, { replace: true, preventScrollReset: true })}
            className="rounded-lg border px-2 py-1 text-sm max-w-56"
            style={{ backgroundColor: "var(--garden-ink)", borderColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" }}
          >
            <option value="all">All roles</option>
            {allGroups.map((group) => <option key={group.key} value={group.key}>{group.title} ({group.candidates.length})</option>)}
          </select>
        </label>
      </div>
      {groups.length === 0 && <p className="text-sm" style={{ color: "var(--garden-dim)" }}>No pending candidates for this role. Choose All roles to review the others.</p>}
      {groups.map((group) => (
        <section key={group.key} aria-label={`${group.title} candidates`} className="flex flex-col gap-3">
          <h3 className="font-semibold text-sm" style={{ color: "var(--garden-paper)" }}>{group.title}</h3>
          {group.candidates.map((candidate) => {
            const busy = busyId === candidate.memberId;
            return (
              <article key={candidate.memberId} id={`candidate-${candidate.memberId}`} className="rounded-xl border p-3 flex flex-col gap-3" style={{ borderColor: focusedId === candidate.memberId ? "var(--garden-citron)" : "var(--garden-hairline)", backgroundColor: "var(--garden-ink)" }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <PersonAvatar name={candidate.name} imageUrl={candidate.imageUrl} size="xs" tone="garden" />
                  {candidate.profileId ? <Link to={`/profile/${candidate.profileId}`} onClick={() => setParams((previous) => { const next = new URLSearchParams(previous); next.set("candidate", candidate.memberId); return next; }, { replace: true, preventScrollReset: true })} className="text-sm font-medium underline underline-offset-2" style={{ color: "var(--garden-paper)" }}>{candidate.name}</Link> : <span className="text-sm" style={{ color: "var(--garden-paper)" }}>{candidate.name}</span>}
                  <label className="ml-auto flex items-center gap-2 text-xs" style={{ color: "var(--garden-dim)" }}>
                    Private review
                    <select aria-label={`Review stage for ${candidate.name}`} value={candidate.reviewStage ?? "new"} disabled={busy} onChange={(event) => onStage(candidate.memberId, event.target.value as ReviewStage)} className="rounded-lg border px-2 py-1 text-xs disabled:opacity-50" style={{ backgroundColor: "var(--garden-ink-raised)", borderColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" }}>
                      <option value="new">New</option><option value="considering">Considering</option><option value="discussing">Discussing</option>
                    </select>
                  </label>
                </div>
                {candidate.message && <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--garden-body)" }}>{candidate.message}</p>}
                <ApplicationEvidence evidence={candidate} sampleLabel={`Work samples from ${candidate.name}`} />
                <div className="flex items-center gap-3 flex-wrap">
                  {messageButton(candidate)}
                  <button type="button" disabled={busy} onClick={() => onDecision(candidate.memberId, true)} className="text-xs px-2.5 py-1 rounded-lg font-semibold disabled:opacity-50" style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}>Accept</button>
                  <button type="button" disabled={busy} onClick={() => onDecision(candidate.memberId, false)} className="text-xs underline underline-offset-2 disabled:opacity-50" style={{ color: "var(--garden-dim)" }}>Decline</button>
                  {!(candidate.memberId in notes) && <button type="button" onClick={() => onNote(candidate.memberId, "")} className="text-xs underline underline-offset-2" style={{ color: "var(--garden-dim)" }}>Add a note</button>}
                </div>
                {candidate.memberId in notes && <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--garden-dim)" }}>Note sent with Accept or Decline
                  <input value={notes[candidate.memberId] ?? ""} onChange={(event) => onNote(candidate.memberId, event.target.value)} maxLength={500} className="w-full rounded-lg border px-2.5 py-1.5 text-sm" style={{ backgroundColor: "var(--garden-ink-raised)", borderColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" }} />
                </label>}
              </article>
            );
          })}
        </section>
      ))}
    </section>
  );
}
