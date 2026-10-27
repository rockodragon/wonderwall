import { describe, expect, it } from "vitest";
import { recruitmentNextAction } from "./recruitment";
import { needsYou } from "./needsYou";
import { summary } from "./model";
import { project, projectRequest, shortlist, NOW } from "./fixtures";
import { itemHref } from "../../components/shortlist/href";
import { rowModel } from "../../components/shortlist/rowModel";
import { shortlistCard } from "../../desk/shortlistCards";

const base = { viewerId: "lead", leadId: "lead", projectId: "film", memberId: "application", createdAt: 1 };
const message = { senderId: "lead", conversationId: "thread", createdAt: 2 };

describe("recruitment follow-through across the existing Shortlist", () => {
  it("puts a new application with its reviewer and sends phone/desk to the candidate", () => {
    const nextAction = recruitmentNextAction(base);
    const request = { ...projectRequest("Alex", "Film"), requestId: "application", nextAction };
    const data = shortlist({ requests: [request] });
    expect(needsYou(data, NOW)).toHaveLength(1);
    expect(itemHref({ type: "request", request })).toBe("/projects/film?tab=team&candidate=application");
    expect(summary(data, NOW).projects.next).toBe("Review Alex's application · Film");
    const card = shortlistCard({ type: "request", request }, { now: NOW, money: String, projects: [], events: [] });
    expect(card.detail.action).toMatchObject({ kind: "shortlist", buttons: [{ kind: "link", label: "Review", href: nextAction.href }] });
  });

  it("puts Reply with the applicant after producer outreach, then with the lead after a reply", () => {
    const producerAction = recruitmentNextAction({ ...base, latestMessage: message });
    const applicantAction = recruitmentNextAction({ ...base, viewerId: "applicant", latestMessage: message });
    const request = { ...projectRequest("Alex", "Film"), nextAction: producerAction };
    const waiting = project("waiting", "Film", { nextAction: applicantAction });
    expect(needsYou(shortlist({ requests: [request] }), NOW)).toEqual([]);
    const applicantData = shortlist({ projects: [waiting] });
    expect(needsYou(applicantData, NOW)).toHaveLength(1);
    expect(summary(applicantData, NOW).projects.needsYou).toBe(1);
    expect(itemHref({ type: "project", row: waiting })).toBe("/messages/thread?application=application");
    expect(rowModel({ type: "project", row: waiting }, { hot: true, withArea: false, money: String }).action).toBe("Reply");
    expect(recruitmentNextAction({ ...base, latestMessage: { ...message, senderId: "applicant" } }).kind).toBe("reply");
  });

  it("keeps an undecided consideration actionable without revealing its stage to the applicant", () => {
    expect(recruitmentNextAction({ ...base, reviewStage: "considering", reviewUpdatedAt: 5 })).toMatchObject({ kind: "decide", since: 5 });
    const action = recruitmentNextAction({ ...base, viewerId: "applicant", reviewStage: "discussing", reviewUpdatedAt: 5 });
    expect(action).toMatchObject({ kind: "waiting", since: 1 });
    expect(action).not.toHaveProperty("reviewStage");
  });
});
