// The applicant and the lead inspect the same submitted evidence. Callers
// decide who may see it; this component never fetches another person's data.
import type { ReactNode } from "react";
import type { PortfolioSample } from "../../../convex/portfolioSamples";
import { rateProposalLabel, type RateProposal } from "../../../convex/garden/recruitment";
import { PortfolioSamplePreview } from "../PortfolioSamples";

export interface ApplicationEvidenceData {
  availability?: string | null;
  rateProposal?: RateProposal | null;
  workSamples?: readonly PortfolioSample[];
}

export function ApplicationEvidence({ evidence, sampleLabel = "Submitted work samples" }: { evidence: ApplicationEvidenceData; sampleLabel?: string }) {
  return <>
    {(evidence.availability || evidence.rateProposal) && <dl className="text-sm grid gap-2" style={{ color: "var(--garden-body)" }}>
      {evidence.availability && <div><dt className="text-xs uppercase opacity-65">Availability</dt><dd className="whitespace-pre-wrap">{evidence.availability}</dd></div>}
      {evidence.rateProposal && <div><dt className="text-xs uppercase opacity-65">Proposed rate</dt><dd>{rateProposalLabel(evidence.rateProposal)}</dd></div>}
    </dl>}
    {!!evidence.workSamples?.length && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" aria-label={sampleLabel}>
      {evidence.workSamples.map((sample) => <figure key={sample.artifactId} className="min-w-0 flex flex-col gap-1.5"><PortfolioSamplePreview sample={sample} /><figcaption className="text-xs" style={{ color: "var(--garden-dim)" }}>{sample.title || "Work sample"}</figcaption></figure>)}
    </div>}
  </>;
}

export function SubmittedApplication({ evidence, role, messageButton }: { evidence: ApplicationEvidenceData; role: string; messageButton: ReactNode }) {
  return <section aria-label="Your application" className="mt-3 rounded-xl border p-3 flex flex-col gap-3" style={{ borderColor: "var(--garden-hairline)", backgroundColor: "var(--garden-ink)" }}>
    <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold" style={{ color: "var(--garden-paper)" }}>Your application{role ? ` · ${role}` : ""}</h3>{messageButton}</div>
    <ApplicationEvidence evidence={evidence} />
    {!evidence.availability && !evidence.rateProposal && !evidence.workSamples?.length && <p className="text-xs" style={{ color: "var(--garden-dim)" }}>No work samples, availability or rate proposal were included.</p>}
    <p className="text-xs" style={{ color: "var(--garden-dim)" }}>Waiting for the lead. You can ask a question before they decide.</p>
  </section>;
}
