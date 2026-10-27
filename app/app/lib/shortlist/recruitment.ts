import { addressName } from "../names";

/** A pending application's next step, from this viewer's perspective.
 * No application note, proposed rate or private review stage leaves the
 * backend through this projection. */
export interface RecruitmentNextAction {
  kind: "review" | "reply" | "decide" | "waiting";
  since: number;
  href: string;
}

export function applicationReviewHref(projectId: string, memberId: string): string {
  return `/projects/${encodeURIComponent(projectId)}?tab=team&candidate=${encodeURIComponent(memberId)}`;
}

/** One rule for the producer's request and the applicant's waiting row.
 * Only messages explicitly about this application count: an unrelated
 * conversation between the same people cannot change whose turn it is. */
export function recruitmentNextAction(input: {
  viewerId: string;
  leadId: string;
  projectId: string;
  memberId: string;
  createdAt: number;
  reviewStage?: string;
  reviewUpdatedAt?: number;
  latestMessage?: { senderId: string; createdAt: number; conversationId: string } | null;
}): RecruitmentNextAction {
  const reviewHref = applicationReviewHref(input.projectId, input.memberId);
  const message = input.latestMessage;
  if (message) {
    return {
      kind: message.senderId === input.viewerId ? "waiting" : "reply",
      since: message.createdAt,
      href: `/messages/${encodeURIComponent(message.conversationId)}?application=${encodeURIComponent(input.memberId)}`,
    };
  }
  const isLead = input.viewerId === input.leadId;
  return {
    kind: isLead ? (input.reviewStage && input.reviewStage !== "new" ? "decide" : "review") : "waiting",
    since: isLead ? input.reviewUpdatedAt ?? input.createdAt : input.createdAt,
    href: reviewHref,
  };
}

/** Copy shared by rows, opened cards and overview summaries. */
export function recruitmentActionCopy(action: RecruitmentNextAction, otherName: string) {
  const name = addressName(otherName);
  switch (action.kind) {
    case "review":
      return { label: "Review", status: "Application needs review", summary: `Review ${name}'s application` };
    case "reply":
      return { label: "Reply", status: `${name} is waiting on your reply`, summary: `Reply to ${name}` };
    case "decide":
      return { label: "Review next step", status: "Choose the next step", summary: `Choose the next step for ${name}` };
    case "waiting":
      return { label: "See conversation", status: `Waiting on ${name}`, summary: `Waiting on ${name}` };
  }
}
